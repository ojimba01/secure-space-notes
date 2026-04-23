DO $$
BEGIN
  UPDATE public.clients
  SET insurance = 'AETNA',
      member_id = NULLIF(regexp_replace(regexp_replace(member_id, '(aetna|(^|[^a-z0-9])aet([^a-z0-9]|$))', ' ', 'gi'), '^[\s\-_:]+|[\s\-_:]+$', '', 'g'), '')
  WHERE insurance IS NULL AND member_id IS NOT NULL
    AND (member_id ~* 'aetna' OR member_id ~* '(^|[^a-z0-9])aet([^a-z0-9]|$)');

  UPDATE public.clients
  SET insurance = 'HORIZON',
      member_id = NULLIF(regexp_replace(regexp_replace(member_id, '(horizon|horiz|(^|[^a-z0-9])hbcbs([^a-z0-9]|$)|(^|[^a-z0-9])hor([^a-z0-9]|$))', ' ', 'gi'), '^[\s\-_:]+|[\s\-_:]+$', '', 'g'), '')
  WHERE insurance IS NULL AND member_id IS NOT NULL
    AND (member_id ~* 'horizon' OR member_id ~* 'horiz'
         OR member_id ~* '(^|[^a-z0-9])hbcbs([^a-z0-9]|$)'
         OR member_id ~* '(^|[^a-z0-9])hor([^a-z0-9]|$)');

  UPDATE public.clients
  SET insurance = 'WELLPOINT',
      member_id = NULLIF(regexp_replace(regexp_replace(member_id, '(wellpoint|well point|wellpt|(^|[^a-z0-9])wp([^a-z0-9]|$))', ' ', 'gi'), '^[\s\-_:]+|[\s\-_:]+$', '', 'g'), '')
  WHERE insurance IS NULL AND member_id IS NOT NULL
    AND (member_id ~* 'wellpoint' OR member_id ~* 'well point' OR member_id ~* 'wellpt'
         OR member_id ~* '(^|[^a-z0-9])wp([^a-z0-9]|$)');

  UPDATE public.clients
  SET insurance = 'UNITED HEALTH',
      member_id = NULLIF(regexp_replace(regexp_replace(member_id, '(unitedhealth|united health|united|(^|[^a-z0-9])uhc([^a-z0-9]|$)|(^|[^a-z0-9])uh([^a-z0-9]|$))', ' ', 'gi'), '^[\s\-_:]+|[\s\-_:]+$', '', 'g'), '')
  WHERE insurance IS NULL AND member_id IS NOT NULL
    AND (member_id ~* 'unitedhealth' OR member_id ~* 'united health' OR member_id ~* 'united'
         OR member_id ~* '(^|[^a-z0-9])uhc([^a-z0-9]|$)'
         OR member_id ~* '(^|[^a-z0-9])uh([^a-z0-9]|$)');

  UPDATE public.clients
  SET insurance = 'FIDELIS',
      member_id = NULLIF(regexp_replace(regexp_replace(member_id, '(fidelis|(^|[^a-z0-9])fid([^a-z0-9]|$))', ' ', 'gi'), '^[\s\-_:]+|[\s\-_:]+$', '', 'g'), '')
  WHERE insurance IS NULL AND member_id IS NOT NULL
    AND (member_id ~* 'fidelis' OR member_id ~* '(^|[^a-z0-9])fid([^a-z0-9]|$)');
END $$;