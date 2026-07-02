DELETE FROM public.clients_import_staging WHERE id='3d7922b6-714b-4a06-90e3-afb11dff5dd2';
UPDATE public.clients_import_staging SET id='3d7922b6-714b-4a06-90e3-afb11dff5dd2' WHERE id='1b1c6127-41b4-4d2f-9122-f9b092038e96';
INSERT INTO public.clients_import_staging (id, full_update, first_name, last_name)
VALUES ('1b1c6127-41b4-4d2f-9122-f9b092038e96', false, 'Destiny', 'Jamison');
SELECT public.apply_clients_import();