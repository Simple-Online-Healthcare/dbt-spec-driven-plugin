# Documentation Reference — Contextual dbt Docs

Used by the `spec-driven` Documentation step. The goal is **contextual** documentation:
explain *why* a model exists and what business question it answers, not a restatement of
its columns. `AGENTS.md` §4 makes descriptions mandatory; this reference makes them good.

## The test for a good description

A description passes if a new analyst, reading only it, can answer:
1. What business question/decision does this model serve?
2. What is its grain (one row per …)?
3. Where does it sit in the pipeline (which layer, fed by what)?

If the description only repeats the model name or lists columns, it fails.

## Model-level YAML pattern

```yaml
models:
  - name: int_sop_uk__patient_orders
    description: >
      One row per patient order for the SOP UK brand. Joins staged orders to patients
      and shipments so downstream marts can report fulfilment and revenue without
      re-deriving order state. Grain: one row per order_id. Excludes cancelled orders
      (see WHERE clause) because they never reach fulfilment.
    columns:
      - name: order_id
        description: Primary key. Natural key from the backend orders table.
        tests: [unique, not_null]
      - name: is_first_order
        description: >
          True when this is the patient's earliest non-cancelled order, used by
          acquisition reporting to attribute new-patient revenue.
```

Bad (restates names, no context):

```yaml
    description: Patient orders model.
    columns:
      - name: order_id
        description: The order id.
      - name: is_first_order
        description: Is first order.
```

## Column descriptions

- Explain meaning and business use, not the data type.
- Booleans: state what `true` means and who relies on it.
- Derived columns: name the rule/source of the calculation.
- Foreign keys: name the parent entity they point to.

## Repo / schema-level "why" notes

When discovery reveals a whole area is undocumented, capture orientation at the right level:

- **Schema/folder README** (`dbt/models/<area>/README.md`): what this area is for, the
  brands/regions it covers, and the key entities — so a reader knows where to look.
- Tie naming back to `dbt/README.md` (`[brand]_[region]__[entity]`): spell out the brand
  and region a model serves when it is not obvious from context.

## Inline SQL comments (AGENTS.md §10)

YAML descriptions explain *what a model is for*; inline comments explain *why a specific
piece of SQL is written the way it is*. §10 makes a comment **mandatory** on
intentional-but-implicit logic. The comment must state intent — not restate the syntax.

Good (explains the deliberate choice):

```sql
-- UNION ALL: staging is already deduped per source; dedup here would drop legitimate
-- same-day re-orders that share an order_id across brands.
select * from sop_uk_orders
union all
select * from kap_uk_orders

-- LEFT JOIN: keep every order even when no shipment row exists yet; downstream
-- fulfilment reporting treats a NULL shipped_at as "not yet shipped", not "no order".
from orders o
left join shipments s on s.order_id = o.order_id

-- CASE order is load-bearing: 'cancelled' must win over 'shipped' because a cancelled
-- order can still have a stale shipment row.
case
  when is_cancelled then 'cancelled'
  when shipped_at is not null then 'shipped'
  else 'pending'
end as order_status

-- QUALIFY: one row per patient — keep the most recent order; ties broken by order_id
-- so the result is deterministic across runs.
qualify row_number() over (partition by patient_id order by ordered_at desc, order_id) = 1
```

Bad (content-free — fails review even though a comment exists):

```sql
-- union all
select ...
-- left join
from ...
-- case statement
case when ...
```

## When to run this step

- Automatically: when the `discovery` agent flags new/undocumented models a change
  depends on.
- Standalone: when the user asks to "document" a model, on the current branch.

Keep edits scoped to the models in play — do not bulk-document unrelated areas.
