'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Sparkles, Search } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

interface CategorySelectorProps {
  transactionId: string;
  transactionDescription: string;
  currentCategory: Category | null;
  categories: Category[];
  onCategoryChange: (transactionId: string, categoryId: string, learnFromThis: boolean) => void;
}

export function CategorySelector({
  transactionId,
  transactionDescription,
  currentCategory,
  categories,
  onCategoryChange,
}: CategorySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [learnFromThis, setLearnFromThis] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  // Calculate dropdown position
  const calculatePosition = () => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 320; // max-h-64 (256px) + search + checkbox (~64px)

    // Check if dropdown would go below viewport
    const spaceBelow = viewportHeight - rect.bottom;
    const shouldOpenUpward = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    setDropdownStyle({
      position: 'fixed',
      top: shouldOpenUpward ? Math.max(8, rect.top - dropdownHeight) : rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
      width: 288, // w-72 = 18rem = 288px
      zIndex: 9999,
    });
  };

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen) {
      calculatePosition();
      // Focus search input after position is set, without scrolling
      setTimeout(() => {
        searchInputRef.current?.focus({ preventScroll: true });
      }, 10);
    }
  }, [isOpen]);

  // Close dropdown on scroll to prevent position issues
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => {
      setIsOpen(false);
      setSearchTerm('');
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  // Sort categories alphabetically and filter by search
  const filteredCategories = useMemo(() => {
    const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name, 'he'));

    if (!searchTerm.trim()) return sorted;

    return sorted.filter(cat =>
      cat.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [categories, searchTerm]);

  const handleSelect = async (categoryId: string) => {
    if (categoryId === currentCategory?.id) {
      setIsOpen(false);
      setSearchTerm('');
      return;
    }

    setIsUpdating(true);
    try {
      await onCategoryChange(transactionId, categoryId, learnFromThis);
    } finally {
      setIsUpdating(false);
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSearchTerm('');
  };

  const dropdownContent = isOpen ? (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={handleClose}
      />

      {/* Dropdown */}
      <div
        ref={dropdownRef}
        style={dropdownStyle}
        className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
      >
        {/* Search */}
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="חיפוש קטגוריה..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-8 pl-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Learn checkbox */}
        <div className="p-2 bg-blue-50 border-b">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={learnFromThis}
              onChange={(e) => setLearnFromThis(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs text-blue-700 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              למד מהשיוך הזה
            </span>
          </label>
        </div>

        {/* Category list */}
        <div className="max-h-64 overflow-y-auto">
          {filteredCategories.length === 0 ? (
            <div className="p-3 text-center text-sm text-gray-500">
              לא נמצאו קטגוריות
            </div>
          ) : (
            filteredCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleSelect(cat.id)}
                className={`
                  w-full px-3 py-2 text-right flex items-center gap-2
                  hover:bg-gray-50 transition-colors
                  ${currentCategory?.id === cat.id ? 'bg-blue-50' : ''}
                `}
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-sm"
                  style={{ backgroundColor: `${cat.color}30` }}
                >
                  {cat.icon}
                </span>
                <span className="flex-1 text-sm text-gray-700">{cat.name}</span>
                {currentCategory?.id === cat.id && (
                  <Check className="h-4 w-4 text-blue-600" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </>
  ) : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isUpdating}
        className={`
          inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
          transition-all cursor-pointer hover:ring-2 hover:ring-blue-300
          ${isUpdating ? 'opacity-50' : ''}
          ${currentCategory
            ? ''
            : 'bg-orange-100 text-orange-700 border border-dashed border-orange-300'
          }
        `}
        style={currentCategory && currentCategory.color ? {
          backgroundColor: `${currentCategory.color}20`,
          color: currentCategory.color
        } : undefined}
      >
        {currentCategory ? (
          <>
            {currentCategory.icon} {currentCategory.name}
          </>
        ) : (
          <>לא מסווג - לחץ לשיוך</>
        )}
        <ChevronDown className="h-3 w-3" />
      </button>

      {typeof window !== 'undefined' && dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  );
}
