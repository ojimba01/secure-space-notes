import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Check user active status after state is set
        if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          setTimeout(() => {
            checkUserActive(session.user.id);
          }, 0);
        }
        
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          setLoading(false);
        }
      }
    );

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      // Check user active status after initial load
      if (session?.user) {
        setTimeout(() => {
          checkUserActive(session.user.id);
        }, 0);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Separate function to check if user is active
  const checkUserActive = async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('active')
        .eq('user_id', userId)
        .maybeSingle();

      if (profile && !profile.active) {
        // User is inactive, sign them out
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
      }
    } catch (error) {
      console.error('Error checking user active status:', error);
    }
  };

  const signUp = async (email: string, password: string, firstName: string, lastName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          first_name: firstName,
          last_name: lastName,
        }
      }
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error };
    }

    // Check if user account is active
    if (data.user) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('active')
        .eq('user_id', data.user.id)
        .single();

      // A lookup that failed and an account that is switched off are different
      // things. Reporting both as "deactivated" told people with a working
      // account to go and ask an administrator to reinstate them, which no
      // administrator could do because nothing was wrong with the account.
      if (profileError) {
        await supabase.auth.signOut();
        console.error('Sign-in blocked: the staff record could not be read.', profileError);
        return {
          error: {
            message:
              'Your staff record could not be read, so sign-in was stopped. This is a fault in the system, not a problem with your account. Try again, and tell an administrator if it continues.',
          },
        };
      }

      if (!profile.active) {
        // Sign out the user immediately
        await supabase.auth.signOut();
        return {
          error: {
            message: 'Your account has been deactivated. Please contact your administrator.'
          }
        };
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};