-- CLI generated 20261119122829. Preserve seeded history without overriding an earlier admin schedule.
update public.sales_product_prices baseline
set effective_until=baseline.effective_from
where baseline.created_by is null and baseline.effective_until is null
and exists(select 1 from public.sales_product_prices configured
 where configured.product_id=baseline.product_id and configured.created_by is not null
 and configured.effective_from<=baseline.effective_from
 and (configured.effective_until is null or configured.effective_until>baseline.effective_from));
notify pgrst,'reload schema';
