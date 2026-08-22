import { BookOpenCheck } from 'lucide-react';
import { Layout } from '../components/Layout';

export function Curriculum() {
  return (
    <Layout title="Curriculum" showBack>
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-chess-light text-navy">
          <BookOpenCheck size={27} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <h2 className="text-lg font-bold text-gray-900">Curriculum coming soon</h2>
        <p className="mt-2 max-w-xs text-sm text-gray-500">
          Beginner, intermediate, advanced, and competitive player syllabuses will be published here.
        </p>
      </div>
    </Layout>
  );
}