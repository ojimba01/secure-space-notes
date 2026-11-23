import React, { useState } from 'react';
import { Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { DrawnCheck } from '@/components/motion/DrawnCheck';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { returnTo } from '@/lib/returnTo';
import { BrandMark } from '@/components/Sidebar';

// Set to null to allow any email domain, or specify domain like '@supportivecm.org'
const ALLOWED_EMAIL_DOMAIN: string | null = '@supportivecm.org';

// Addresses allowed to sign up despite not being on the domain above. Named one
// by one on purpose: the alternative is opening signup to every email there is.
// An address here still only becomes a superadmin if handle_new_user() says so.
const ALLOWED_EMAILS: string[] = ['mdajimba@gmail.com'];

const Auth = () => {
  const { user, signIn, signUp, loading } = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (user) {
    return <Navigate to={returnTo((location.state as { from?: unknown } | null)?.from)} replace />;
  }

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const { error } = await signIn(email, password);
    
    if (error) {
      toast({
        title: "Sign-in failed.",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Welcome back!",
        description: "You have been signed in successfully.",
      });
    }
    
    setIsSubmitting(false);
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;

    // Validate email domain (if configured), allowing the named exceptions
    const allowed =
      !ALLOWED_EMAIL_DOMAIN ||
      email.trim().toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN) ||
      ALLOWED_EMAILS.includes(email.trim().toLowerCase());
    if (!allowed) {
      toast({
        title: "Invalid email domain",
        description: `Only ${ALLOWED_EMAIL_DOMAIN} email addresses are allowed to sign up.`,
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    const { error } = await signUp(email, password, firstName, lastName);
    
    if (error) {
      toast({
        title: "Sign-up failed.",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Account created.",
        description: "Your account has been created successfully. You can now sign in.",
      });
    }
    
    setIsSubmitting(false);
  };

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Reset instructions sent",
        description: "Check your email for password reset instructions.",
      });
      setShowForgotPassword(false);
    }
    
    setIsSubmitting(false);
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* The agency's panel: beside the form on a wide screen, gone on a phone. */}
      <aside className="relative hidden w-[44%] max-w-[620px] flex-col justify-between overflow-hidden bg-gradient-to-br from-[hsl(203_72%_24%)] to-[hsl(200_60%_36%)] p-14 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 animate-float rounded-full bg-white/[0.06]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-white/[0.05] [animation:float_5s_ease-in-out_infinite]" />
        <Link to="/" className="relative w-fit rounded-xl bg-white px-4 py-3 shadow-sm transition-transform hover:-translate-y-0.5">
          <BrandMark className="w-48" />
        </Link>
        <div className="relative max-w-md space-y-6">
          <h2 className="animate-rise text-[34px] font-semibold leading-[1.25]">Every client, every visit, every note in one place.</h2>
          <ul className="stagger space-y-3">
            {['Clients, forms and authorizations', 'Touchpoints and the calendar', 'Notes written from your selections'].map((t) => (
              <li key={t} className="flex items-center gap-3 text-[15px] font-medium text-white/85">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
                  <DrawnCheck className="h-3.5 w-3.5" delay={300} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">Supportive Care Management LLC</p>
      </aside>

      <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-[400px] animate-rise space-y-6">
        <Link to="/" className="mx-auto block w-fit transition-opacity hover:opacity-80 lg:hidden">
          <BrandMark className="w-56" />
        </Link>

        <div className="w-full">
        <div className="mb-6 space-y-1">
          <p className="text-[13px] font-semibold text-primary">Clinical Notes</p>
          <h1 className="text-[30px] font-semibold tracking-tight text-foreground">
            {showForgotPassword ? 'Reset password' : tab === 'signin' ? 'Sign in' : 'Create account'}
          </h1>
        </div>
        <div>
          {showForgotPassword ? (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">Enter your email to receive reset instructions.</p>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email address</Label>
                  <Input
                    id="reset-email"
                    name="email"
                    type="email"
                    placeholder="Enter your email address"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? 'Sending...' : 'Send reset instructions'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowForgotPassword(false)}
                  >
                    Back to sign in
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'signin' | 'signup')} className="space-y-6">

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="Enter your email address"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="Enter your password"
                      required
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-[13px] font-semibold text-primary underline-offset-2 hover:underline"
                      onClick={() => setShowForgotPassword(true)}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
                    {isSubmitting ? 'Signing in...' : 'Sign in'}
                  </Button>
                  <p className="text-center text-[13px] text-muted-foreground">
                    New to the agency?{' '}
                    <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => setTab('signup')}>
                      Create account
                    </button>
                  </p>
                </form>
              </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      placeholder="First name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      placeholder="Last name"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email address</Label>
                  <Input
                    id="signup-email"
                    name="email"
                    type="email"
                    placeholder="yourname@supportivecm.org"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    name="password"
                    type="password"
                    placeholder="Create a password"
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating account...' : 'Create account'}
                </Button>
                <p className="text-center text-[13px] text-muted-foreground">
                  Already have an account?{' '}
                  <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => setTab('signin')}>
                    Sign in
                  </button>
                </p>
              </form>
            </TabsContent>
          </Tabs>
          )}
        </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Auth;
