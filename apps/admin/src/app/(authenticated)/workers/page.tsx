import { redirect } from 'next/navigation';

export default function WorkersIndexRedirect() {
  redirect('/workers/attendance');
}
