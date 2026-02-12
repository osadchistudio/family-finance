import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { AUTH_COOKIE_NAME, isValidSessionToken } from '@/lib/auth';

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (isValidSessionToken(token)) {
    redirect('/');
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <LoginForm />
    </div>
  );
}
