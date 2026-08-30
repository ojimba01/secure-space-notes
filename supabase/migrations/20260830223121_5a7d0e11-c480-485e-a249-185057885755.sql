delete from public.tutorial_steps;

insert into public.tutorial_steps
  (role_type, step_number, page_route, target_selector, title, description, position, action_type)
values
  -- Everyone -------------------------------------------------------------
  ('employee', 1, '/', '[data-tutorial="clients-nav"]', 'Your clients',
   'Every client assigned to you. A badge shows what a client still needs before they can be billed.', 'right', null),
  ('employee', 2, '/', '[data-tutorial="touchpoints-nav"]', 'Touchpoints',
   'Record each contact here. A Low level client needs 2 a cycle, a High level client needs 4.', 'right', null),
  ('employee', 3, '/', '[data-tutorial="forms-nav"]', 'Forms',
   'Fill in a blank form for a client. Completed forms live on the client''s own record.', 'right', null),
  ('employee', 4, '/', '[data-tutorial="calendar-nav"]', 'Calendar',
   'Your scheduled touchpoints. Open a client from here to record one.', 'right', null),
  -- Administrators -------------------------------------------------------
  ('admin', 1, '/', '[data-tutorial="admin-nav"]', 'Admin dashboard',
   'Start here. It shows what needs attention across the whole agency.', 'right', null),
  ('admin', 2, '/admin', '[data-tutorial="priority-tiles"]', 'Priorities',
   'Clients missing something they need before they can be billed. Select a tile to see them.', 'bottom', null),
  ('admin', 3, '/admin', '[data-tutorial="urgent-claims"]', 'Urgent claims',
   'Claims closest to their six-month filing deadline. After it passes the money cannot be recovered.', 'bottom', null),
  ('admin', 4, '/admin', '[data-tutorial="staff-touchpoints"]', 'Touchpoints by case manager',
   'Set a start date for each case manager once they have completed the walkthrough. Nothing counts as late before it.', 'bottom', null),
  ('admin', 5, '/admin', '[data-tutorial="hsp-panel"]', 'HSPs',
   'Plans due on day 25 of the 30-day authorization, and any that are late.', 'bottom', null),
  ('admin', 6, '/', '[data-tutorial="clients-nav"]', 'Clients',
   'Every client in the agency. Open one to see their forms, authorizations and documents.', 'right', null),
  ('admin', 7, '/', '[data-tutorial="forms-nav"]', 'Forms',
   'Blank forms to fill in. The IAT and the HSP are the two sent to an MCO.', 'right', null),
  ('admin', 8, '/', '[data-tutorial="billing-nav"]', 'Billing',
   'Client details, then the clients to bill, then revenue. Availity sits inside it as a step.', 'right', null);
