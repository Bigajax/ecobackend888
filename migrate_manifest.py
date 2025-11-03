import json
import os
import re
import yaml # Using pyyaml for safer and more robust frontmatter parsing

def estimate_tokens(content):
    """Estimates the number of tokens in a string."""
    return round(len(content) / 4)

def get_size(tokens):
    """Determines the size category based on the number of tokens."""
    if not isinstance(tokens, (int, float)) or tokens < 0:
        return 'S' # Default for invalid token counts
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
    main_content = content
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)', content, re.DOTALL)
    if match:
        frontmatter_str = match.group(1)
        main_content = match.group(2).strip()
        try:
            # Using yaml.safe_load for robust parsing of the frontmatter
            parsed_yaml = yaml.safe_load(frontmatter_str)
            if isinstance(parsed_yaml, dict):
                meta = parsed_yaml
        except yaml.YAMLError as e:
            print(f"Warning: Could not parse YAML frontmatter. Error: {e}")
            # Fallback to simple key-value parsing if yaml fails
            for line in frontmatter_str.split('\n'):
                if ':' in line:
                    key, value = line.split(':', 1)
                    meta[key.strip()] = value.strip()
    return meta, main_content

def main():
    """Main function to migrate the manifest."""
    # Pre-defined module data from the prompt (highest priority)
    predefined_modules = {
        "developer_prompt.txt": {"family": "core", "role": "instruction", "size": "L", "tokens_avg": 3222},
        "ANTISALDO_MIN.txt": {"family": "core", "role": "instruction", "size": "M", "tokens_avg": 617},
        "nv1_core.txt": {"family": "core", "role": "instruction", "size": "S", "tokens_avg": 211},
        "identidade_mini.txt": {"family": "core", "role": "instruction", "size": "M", "tokens_avg": 467},
        "eco_estrutura_de_resposta.txt": {"family": "core", "role": "instruction", "size": "S", "tokens_avg": 325},
        "usomemorias.txt": {"family": "core", "role": "instruction", "size": "S", "tokens_avg": 34},
        "escala_abertura_1a3.txt": {"family": "extra", "role": "context", "size": "S", "tokens_avg": 169},
        "bloco_tecnico_memoria.txt": {"family": "extra", "role": "instruction", "size": "S", "tokens_avg": 116, "meta": {"activate_if": "intensity>=7"}},
        "metodo_viva_enxuto.txt": {"family": "extra", "role": "instruction", "size": "S", "tokens_avg": 302}
    }

    new_manifest = {
        "version": 2,
        "modules": []
    }

    module_dirs = {
        "core": "server/assets/modulos_core",
        "extra": "server/assets/modulos_extras"
    }

    for family, dir_path in module_dirs.items():
        if not os.path.isdir(dir_path):
            print(f"Directory not found: {dir_path}")
            continue

        for filename in sorted(os.listdir(dir_path)): # Sort for consistent order
            if filename.endswith(".txt"):
                file_path = os.path.join(dir_path, filename)
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                frontmatter, main_content = parse_frontmatter(content)

                module_data = {
                    "id": filename,
                    "family": family,
                }

                # Logic refinement based on code review feedback
                # Priority Order: Predefined > Frontmatter > Heuristic

                if filename in predefined_modules:
                    # 1. Apply predefined data (highest priority)
                    predefined = predefined_modules[filename]
                    module_data.update({
                        "role": predefined.get("role"),
                        "size": predefined.get("size"),
                        "tokens_avg": predefined.get("tokens_avg")
                    })
                    # Merge meta, with predefined meta taking precedence
                    merged_meta = frontmatter
                    if "meta" in predefined:
                        merged_meta.update(predefined["meta"])
                    module_data["meta"] = merged_meta

                else:
                    # 2. Use frontmatter data if available
                    tokens_from_fm = frontmatter.get('tokens_avg')
                    try:
                        tokens = int(tokens_from_fm) if tokens_from_fm is not None else None
                    except (ValueError, TypeError):
                        tokens = None

                    if tokens is None:
                        # 3. Heuristic calculation as fallback
                        tokens = estimate_tokens(main_content)

                    module_data.update({
                        "role": frontmatter.get('role', get_role_from_id(filename)),
                        "size": frontmatter.get('size', get_size(tokens)),
                        "tokens_avg": tokens
                    })
                    module_data["meta"] = frontmatter

                # Clean up meta by removing top-level fields
                for key in ['role', 'size', 'tokens_avg', 'family', 'id']:
                    if key in module_data["meta"]:
                        del module_data["meta"][key]

                if not module_data.get("meta"): # Ensure meta is not included if empty
                    module_data.pop("meta", None)

                new_manifest["modules"].append(module_data)

    output_path = "server/assets/modules.manifest.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(new_manifest, f, indent=2, ensure_ascii=False)

    print(f"New manifest written to {output_path}")

if __name__ == "__main__":
    # Ensure pyyaml is installed
    try:
        import yaml
    except ImportError:
        print("PyYAML not found. Installing...")
        import subprocess
        import sys
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyyaml"])
    main()
