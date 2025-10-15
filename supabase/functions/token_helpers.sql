-- Utility helpers for token and diversity management

create or replace function public.estimate_text_tokens(p_text text)
returns integer
as $$
    select ceil(coalesce(length(p_text), 0) / 4.0)::integer;
$$ language sql immutable;

create or replace function public.apply_token_budget(
    p_budget integer,
    p_cost integer
)
returns integer
as $$
    select greatest(p_budget - coalesce(p_cost, 0), 0);
$$ language sql immutable;

create or replace function public.max_marginal_relevance_score(
    p_similarity numeric,
    p_redundancy numeric,
    p_lambda numeric
)
returns numeric
as $$
    select
        least(greatest(p_lambda, 0), 1) * coalesce(p_similarity, 0)
        - (1 - least(greatest(p_lambda, 0), 1)) * coalesce(p_redundancy, 0);
$$ language sql immutable;

comment on function public.estimate_text_tokens is 'Approximate OpenAI token count using 4 characters per token heuristic.';
comment on function public.apply_token_budget is 'Compute remaining token budget after consuming cost.';
comment on function public.max_marginal_relevance_score is 'Helper to combine similarity and redundancy into an MMR score.';
