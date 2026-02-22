'use client';

import { useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';

export function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setIsVisible(window.scrollY > 300);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-20 sm:bottom-6 left-4 sm:left-6 z-40 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors p-3"
      title="חזרה למעלה"
      aria-label="חזרה למעלה"
    >
      <ChevronUp className="h-5 w-5" />
    </button>
  );
}
