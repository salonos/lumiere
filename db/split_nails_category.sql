-- ════════════════════════════════════════════════════════════════════════════
-- SalonOS — Split the "Nails" category into "Hands" and "Feet"
--
--  Every existing service with category = 'Nails' is re-categorised:
--    • Service name contains "pedi", "toe", or "feet"  →  'Feet'
--    • Everything else                                  →  'Hands'
--
--  Safe across all salons — the rule is name-driven, not salon-specific.
--  Run AFTER pulling the code change that removes 'Nails' from the
--  TypeScript ServiceCategory union, so the UI matches the data.
--
--  After running, check the verify block at the bottom for any rows the
--  rule missed. Edge cases (e.g. a "Nail Spa" service that's foot-focused)
--  can be hand-adjusted in the Services page or with a follow-up UPDATE.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Show what's about to change (dry-run preview) ──────────────────────
select
  id, salon_id, name,
  'Nails' as old_category,
  case
    when lower(name) ~ '(pedi|toe|feet)' then 'Feet'
    else 'Hands'
  end as new_category
from public.services
where category = 'Nails'
order by new_category, name;

-- ── 2. Apply the split ─────────────────────────────────────────────────────
update public.services
   set category = case
     when lower(name) ~ '(pedi|toe|feet)' then 'Feet'
     else 'Hands'
   end
 where category = 'Nails';

-- ── 3. Verify — should return zero rows ────────────────────────────────────
select count(*) as leftover_nails_rows
  from public.services
 where category = 'Nails';

-- ── 4. New category breakdown per salon ────────────────────────────────────
select
  s.name as salon,
  sv.category,
  count(*) as services
from public.services sv
join public.salons   s on s.id = sv.salon_id
where sv.category in ('Hands', 'Feet')
group by s.name, sv.category
order by s.name, sv.category;
