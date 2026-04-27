import { Suspense } from 'react';
import { LoginScreen } from '../../features/auth';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
