import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const email = "ojimba01@outlook.com";
  const password = "Temitope6!";

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: "Root", last_name: "Owner" },
  });

  let userId = created?.user?.id ?? null;

  if (createError && !userId) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users?.find((u) => u.email === email);
    if (found) {
      userId = found.id;
      await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
    }
  }

  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: createError?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  await admin.from("user_roles").delete().eq("user_id", userId);
  const { error: roleError } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role: "superadmin" });

  await admin.from("profiles").update({ active: true }).eq("user_id", userId);

  return new Response(JSON.stringify({ ok: !roleError, userId, roleError: roleError?.message }), {
    headers: { "Content-Type": "application/json" },
  });
});
