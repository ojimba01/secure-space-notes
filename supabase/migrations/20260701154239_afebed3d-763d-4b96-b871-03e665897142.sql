
UPDATE public.clients SET insurance = initcap(lower(insurance)) WHERE insurance IS NOT NULL;
UPDATE public.clients SET county = initcap(lower(county)) WHERE county IS NOT NULL;
