import json
import os
import re
import yaml
import unidecode

def to_camel_case(snake_str):
    """Converts a snake_case string to camelCase."""
    components = snake_str.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])

def normalize_meta_keys(meta):
    """Recursively converts all keys in a dictionary to camelCase."""
    new_meta = {}
    if isinstance(meta, dict):
        for key, value in meta.items():
            new_key = to_camel_case(key)
            new_meta[new_key] = normalize_meta_keys(value)
        return new_meta
    elif isinstance(meta, list):
        return [normalize_meta_keys(item) for item in meta]
    else:
        return meta

def estimate_tokens(content):
    """Estimates tokens. If content exists but calculation is 0, return 1."""
    if not content:
        return 1 # User rule: no module with 0 tokens.
    tokens = round(len(content) / 4)
    return tokens if tokens > 0 else 1

def get_size(tokens):
    """Determines the size category based on the number of tokens."""
    if not isinstance(tokens, (int, float)) or tokens < 0:
        return 'S'
    if tokens <= 400:
        return 'S'
    elif tokens <= 1200:
        return 'M'
    else:
        return 'L'

def get_role_from_id(file_id):
    """Determines the role of a module based on its filename."""
    if any(keyword in file_id.lower() for keyword in ['escala_', 'lexicon']):
        return 'context'
    return 'instruction'

def parse_frontmatter(content):
    """Parses frontmatter from the file content using regex and yaml."""
    meta = {}
    main_content = content.strip()
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)', content, re.DOTALL)
    if match:
        frontmatter_str = match.group(1)
        main_content = match.group(2).strip()
        try:
            parsed_yaml = yaml.safe_load(frontmatter_str)
            if isinstance(parsed_yaml, dict):
                meta = parsed_yaml
        except yaml.YAMLError as e:
            print(f"Warning: Could not parse YAML frontmatter. Error: {e}")
    return meta, main_content

def main():
    """Main function to migrate and normalize the manifest."""
    # Modules to be completely removed from the manifest
    SECRET_MODULES = {
        "OPENROUTER_API_KEY.txt",
        "SUPABASE_URL.txt",
        "SUPABASE_ANON_KEY.txt"
    }

    # Pre-defined module data (highest priority)
    predefined_modules = {
        "developer_prompt.txt": {"family": "core", "role": "instruction", "size": "L", "tokens_avg": 3222},
        "ANTISALDO_MIN.txt": {"family": "core", "role": "instruction", "size": "M", "tokens_avg": 617},
        "nv1_core.txt": {"family": "core", "role": "instruction", "size": "S", "tokens_avg": 211},
        "identidade_mini.txt": {"family": "core", "role": "instruction", "size": "M", "tokens_avg": 467},
        "eco_estrutura_de_resposta.txt": {"family": "core", "role": "instruction", "size": "S", "tokens_avg": 325},
        "usomemorias.txt": {"family": "core", "role": "instruction", "size": "S", "tokens_avg": 34},
        "escala_abertura_1a3.txt": {"family": "extra", "role": "context", "size": "S", "tokens_avg": 169},
        "bloco_tecnico_memoria.txt": {"family": "extra", "role": "instruction", "size": "S", "tokens_avg": 116, "meta": {"activateIf": "intensity>=7"}},
        "metodo_viva_enxuto.txt": {"family": "extra", "role": "instruction", "size": "S", "tokens_avg": 302}
    }

    new_manifest = {"version": 2, "modules": []}
    module_dirs = {"core": "server/assets/modulos_core", "extra": "server/assets/modulos_extras"}
    all_module_files = set()

    for dir_path in module_dirs.values():
        if os.path.isdir(dir_path):
            for filename in os.listdir(dir_path):
                if filename.endswith(".txt"):
                    all_module_files.add(filename)

    for family, dir_path in module_dirs.items():
        if not os.path.isdir(dir_path):
            continue

        for filename in sorted(os.listdir(dir_path)):
            if not filename.endswith(".txt") or filename in SECRET_MODULES:
                continue

            # Normalize filename: remove accents
            normalized_filename = unidecode.unidecode(filename)

            file_path = os.path.join(dir_path, filename)
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            frontmatter, main_content = parse_frontmatter(content)

            module_data = {"id": normalized_filename, "family": family}

            # 1. Get data from predefined list or frontmatter/heuristics
            if normalized_filename in predefined_modules:
                predefined = predefined_modules[normalized_filename]
                module_data.update({
                    "role": predefined.get("role"),
                    "size": predefined.get("size"),
                    "tokens_avg": predefined.get("tokens_avg")
                })
                meta = frontmatter
                if "meta" in predefined:
                    meta.update(predefined["meta"])
            else:
                tokens_from_fm = frontmatter.get('tokens_avg')
                try:
                    tokens = int(tokens_from_fm) if tokens_from_fm is not None else None
                except (ValueError, TypeError):
                    tokens = None

                if tokens is None:
                    tokens = estimate_tokens(main_content)

                module_data.update({
                    "role": frontmatter.get('role', get_role_from_id(normalized_filename)),
                    "size": frontmatter.get('size', get_size(tokens)),
                    "tokens_avg": tokens
                })
                meta = frontmatter

            # 2. Normalize and standardize meta
            normalized_meta = normalize_meta_keys(meta)

            # Ensure dependsOn values are full filenames
            if 'dependsOn' in normalized_meta and isinstance(normalized_meta['dependsOn'], list):
                normalized_meta['dependsOn'] = [
                    f"{dep}.txt" if not dep.endswith(".txt") else dep for dep in normalized_meta['dependsOn']
                ]
                # Check for existence and set disabled flag
                for dep in normalized_meta['dependsOn']:
                    if dep not in all_module_files:
                        normalized_meta['disabled'] = True
                        print(f"Warning: Dependency '{dep}' for module '{normalized_filename}' not found. Disabling module.")
                        break

            # 3. Clean up meta by removing top-level fields that are managed separately
            for key in ['role', 'size', 'tokensAvg', 'family', 'id']:
                if key in normalized_meta:
                    del normalized_meta[key]

            if normalized_meta:
                module_data["meta"] = normalized_meta

            new_manifest["modules"].append(module_data)

    output_path = "server/assets/modules.manifest.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(new_manifest, f, indent=2, ensure_ascii=False)

    print(f"Normalized manifest written to {output_path}")

if __name__ == "__main__":
    try:
        import yaml
    except ImportError:
        print("PyYAML not found. Installing...")
        import subprocess, sys
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyyaml"])
    try:
        import unidecode
    except ImportError:
        print("unidecode not found. Installing...")
        import subprocess, sys
        subprocess.check_call([sys.executable, "-m", "pip", "install", "unidecode"])
    main()
