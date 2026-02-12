'use client';

import { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Pencil, Trash2, Save, X, Search } from 'lucide-react';
import { showToast } from '@/components/ui/Toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface Category {
  id: string;
  name: string;
  nameEn: string | null;
  icon: string;
  color: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  sortOrder: number;
  _count?: {
    transactions: number;
    keywords: number;
  };
  keywords?: { id: string; keyword: string }[];
}

interface IconOption {
  icon: string;
  label: string;
  keywords: string[];
}

// Extended icon picker options with searchable labels/keywords
const ICON_OPTIONS: IconOption[] = [
  { icon: '📁', label: 'כללי', keywords: ['general', 'folder', 'כללי'] },
  { icon: '🛒', label: 'קניות', keywords: ['shopping', 'market', 'קניות', 'סופר'] },
  { icon: '🛍️', label: 'שופינג', keywords: ['shop', 'bag', 'fashion', 'שופינג'] },
  { icon: '🍽️', label: 'מסעדה', keywords: ['food', 'restaurant', 'eat', 'מסעדה'] },
  { icon: '🍔', label: 'המבורגר', keywords: ['food', 'burger', 'אוכל מהיר'] },
  { icon: '🍕', label: 'פיצה', keywords: ['food', 'pizza', 'delivery', 'משלוח'] },
  { icon: '☕', label: 'קפה', keywords: ['coffee', 'cafe', 'קפה'] },
  { icon: '🍣', label: 'סושי', keywords: ['food', 'sushi', 'אוכל'] },
  { icon: '🚗', label: 'רכב', keywords: ['car', 'vehicle', 'auto', 'רכב'] },
  { icon: '⛽', label: 'דלק', keywords: ['fuel', 'gas', 'petrol', 'דלק'] },
  { icon: '🅿️', label: 'חניה', keywords: ['parking', 'park', 'חניה'] },
  { icon: '🚌', label: 'אוטובוס', keywords: ['bus', 'transport', 'תחבורה'] },
  { icon: '🚆', label: 'רכבת', keywords: ['train', 'rail', 'תחבורה'] },
  { icon: '🚕', label: 'מונית', keywords: ['taxi', 'ride', 'נסיעה'] },
  { icon: '✈️', label: 'טיסה', keywords: ['flight', 'airplane', 'travel', 'טיסה'] },
  { icon: '🏠', label: 'בית', keywords: ['home', 'house', 'דיור'] },
  { icon: '🏡', label: 'משכנתא', keywords: ['mortgage', 'home', 'משכנתא'] },
  { icon: '🔑', label: 'שכירות', keywords: ['rent', 'lease', 'שכירות'] },
  { icon: '🛠️', label: 'תחזוקה', keywords: ['maintenance', 'repair', 'תיקון'] },
  { icon: '💡', label: 'חשמל', keywords: ['electricity', 'power', 'חשמל'] },
  { icon: '🚿', label: 'מים', keywords: ['water', 'utility', 'מים'] },
  { icon: '🔥', label: 'גז', keywords: ['gas', 'utility', 'גז'] },
  { icon: '📱', label: 'סלולר', keywords: ['mobile', 'phone', 'cell', 'סלולר'] },
  { icon: '📶', label: 'אינטרנט', keywords: ['internet', 'wifi', 'תקשורת'] },
  { icon: '📺', label: 'טלוויזיה', keywords: ['tv', 'media', 'television', 'טלוויזיה'] },
  { icon: '🧾', label: 'חשבונות', keywords: ['bill', 'invoice', 'חשבוניות'] },
  { icon: '💊', label: 'תרופות', keywords: ['medicine', 'pharmacy', 'בריאות'] },
  { icon: '🏥', label: 'בית חולים', keywords: ['hospital', 'health', 'רפואה'] },
  { icon: '🦷', label: 'רופא שיניים', keywords: ['dentist', 'teeth', 'שיניים'] },
  { icon: '👓', label: 'אופטיקה', keywords: ['glasses', 'optics', 'ראיה'] },
  { icon: '🩺', label: 'רופא', keywords: ['doctor', 'clinic', 'רפואה'] },
  { icon: '💄', label: 'קוסמטיקה', keywords: ['beauty', 'makeup', 'טיפוח'] },
  { icon: '💇', label: 'ספר', keywords: ['hair', 'barber', 'haircut', 'שיער'] },
  { icon: '🧴', label: 'טיפוח אישי', keywords: ['care', 'hygiene', 'personal'] },
  { icon: '👕', label: 'ביגוד', keywords: ['clothes', 'fashion', 'בגדים'] },
  { icon: '👟', label: 'נעליים', keywords: ['shoes', 'footwear', 'נעליים'] },
  { icon: '🎓', label: 'לימודים', keywords: ['education', 'school', 'לימודים'] },
  { icon: '📚', label: 'ספרים', keywords: ['books', 'study', 'ספר'] },
  { icon: '🧑‍🏫', label: 'קורסים', keywords: ['course', 'training', 'קורס'] },
  { icon: '🎬', label: 'קולנוע', keywords: ['movie', 'cinema', 'בילוי'] },
  { icon: '🎭', label: 'תרבות', keywords: ['culture', 'show', 'theatre'] },
  { icon: '🎵', label: 'מוזיקה', keywords: ['music', 'audio', 'מוזיקה'] },
  { icon: '🎮', label: 'גיימינג', keywords: ['games', 'gaming', 'משחקים'] },
  { icon: '🏋️', label: 'כושר', keywords: ['fitness', 'gym', 'ספורט'] },
  { icon: '⚽', label: 'ספורט', keywords: ['sport', 'football', 'אימון'] },
  { icon: '🧘', label: 'יוגה', keywords: ['yoga', 'wellness', 'בריאות'] },
  { icon: '💼', label: 'עבודה', keywords: ['work', 'office', 'עסק'] },
  { icon: '📈', label: 'השקעות', keywords: ['invest', 'stocks', 'finance', 'השקעות'] },
  { icon: '💰', label: 'חיסכון', keywords: ['savings', 'money', 'cash', 'חיסכון'] },
  { icon: '🏦', label: 'בנק', keywords: ['bank', 'finance', 'בנק'] },
  { icon: '💳', label: 'כרטיס אשראי', keywords: ['credit', 'card', 'אשראי'] },
  { icon: '🧮', label: 'חשבונאות', keywords: ['accounting', 'math', 'חשבונאות'] },
  { icon: '📦', label: 'משלוחים', keywords: ['shipping', 'delivery', 'package'] },
  { icon: '🚚', label: 'הובלה', keywords: ['transport', 'truck', 'delivery'] },
  { icon: '🧸', label: 'ילדים', keywords: ['kids', 'baby', 'child'] },
  { icon: '👶', label: 'תינוק', keywords: ['baby', 'infant', 'ילדים'] },
  { icon: '🐕', label: 'חיות מחמד', keywords: ['pets', 'dog', 'cat', 'חיות'] },
  { icon: '🐈', label: 'חתול', keywords: ['cat', 'pets', 'חתול'] },
  { icon: '🎁', label: 'מתנות', keywords: ['gift', 'present', 'מתנה'] },
  { icon: '💍', label: 'אירועים', keywords: ['wedding', 'event', 'אירוע'] },
  { icon: '🧳', label: 'נסיעות', keywords: ['travel', 'trip', 'vacation', 'נופש'] },
  { icon: '🏨', label: 'מלון', keywords: ['hotel', 'travel', 'לינה'] },
  { icon: '🏖️', label: 'חופשה', keywords: ['vacation', 'beach', 'holiday'] },
  { icon: '🎨', label: 'תחביבים', keywords: ['hobby', 'art', 'יצירה'] },
  { icon: '🔧', label: 'כלים', keywords: ['tools', 'hardware', 'repair'] },
  { icon: '🧹', label: 'ניקיון', keywords: ['cleaning', 'home', 'ניקיון'] },
  { icon: '🪑', label: 'ריהוט', keywords: ['furniture', 'home', 'רהיטים'] },
  { icon: '🖥️', label: 'מחשבים', keywords: ['computer', 'pc', 'tech'] },
  { icon: '📲', label: 'אפליקציות', keywords: ['app', 'software', 'mobile'] },
  { icon: '🧠', label: 'התפתחות אישית', keywords: ['self', 'growth', 'mind'] },
  { icon: '🙏', label: 'תרומות', keywords: ['donation', 'charity', 'תרומה'] },
  { icon: '⚖️', label: 'משפטי', keywords: ['legal', 'law', 'עוד'] },
  { icon: '🛡️', label: 'ביטוח', keywords: ['insurance', 'policy', 'ביטוח'] },
  { icon: '💸', label: 'עמלות', keywords: ['fee', 'commission', 'עמלה'] },
  { icon: '🔁', label: 'העברה', keywords: ['transfer', 'move', 'bank transfer'] },
  { icon: '📤', label: 'שליחה', keywords: ['send', 'outgoing', 'transfer'] },
  { icon: '📥', label: 'קבלה', keywords: ['receive', 'incoming', 'deposit'] },
  { icon: '✅', label: 'מאושר', keywords: ['done', 'approved', 'success'] },
  { icon: '❗', label: 'דחוף', keywords: ['urgent', 'important', 'warning'] },
  { icon: '⭐', label: 'מועדף', keywords: ['favorite', 'star', 'best'] },
  { icon: '🚫', label: 'חסום', keywords: ['blocked', 'forbidden', 'ban'] },
  { icon: '🌐', label: 'אונליין', keywords: ['online', 'web', 'internet'] },
  { icon: '🧾', label: 'קבלות', keywords: ['receipt', 'bill', 'invoice'] },
  { icon: '🧑‍💼', label: 'עסקים', keywords: ['business', 'office', 'company'] },
  { icon: '🏢', label: 'משרד', keywords: ['office', 'building', 'work'] },
  { icon: '🧺', label: 'כביסה', keywords: ['laundry', 'clean', 'בית'] },
  { icon: '🪙', label: 'מטבע', keywords: ['coin', 'currency', 'כסף'] },
  { icon: '🏧', label: 'כספומט', keywords: ['atm', 'cash', 'withdraw'] },
  { icon: '📌', label: 'אחר', keywords: ['other', 'misc', 'custom'] },
];

// Color picker options
const COLOR_OPTIONS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
  '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
  '#EC4899', '#F43F5E', '#78716C', '#6B7280', '#64748B'
];

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    category: Category | null;
  }>({ isOpen: false, category: null });

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    nameEn: '',
    icon: '📁',
    color: '#6B7280',
    type: 'EXPENSE' as 'EXPENSE' | 'INCOME' | 'TRANSFER',
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories');
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      showToast('שגיאה בטעינת הקטגוריות', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setFormData({
      name: category.name,
      nameEn: category.nameEn || '',
      icon: category.icon,
      color: category.color,
      type: category.type,
    });
    setIsAdding(false);
  };

  const handleAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setFormData({
      name: '',
      nameEn: '',
      icon: '📁',
      color: '#6B7280',
      type: 'EXPENSE',
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setIsAdding(false);
    setFormData({
      name: '',
      nameEn: '',
      icon: '📁',
      color: '#6B7280',
      type: 'EXPENSE',
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      showToast('יש להזין שם קטגוריה', 'error');
      return;
    }

    try {
      const url = editingId
        ? `/api/categories/${editingId}`
        : '/api/categories';

      const method = editingId ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          nameEn: formData.nameEn || null,
          icon: formData.icon,
          color: formData.color,
          type: formData.type,
        }),
      });

      if (response.ok) {
        showToast(editingId ? 'הקטגוריה עודכנה' : 'הקטגוריה נוספה', 'success');
        fetchCategories();
        handleCancel();
      } else {
        const error = await response.json();
        showToast(error.message || 'שגיאה בשמירה', 'error');
      }
    } catch (error) {
      console.error('Error saving category:', error);
      showToast('שגיאה בשמירת הקטגוריה', 'error');
    }
  };

  const handleDeleteClick = (category: Category) => {
    setDeleteModal({ isOpen: true, category });
  };

  const handleDeleteConfirm = async () => {
    const category = deleteModal.category;
    if (!category) return;

    setDeleteModal({ isOpen: false, category: null });

    try {
      const response = await fetch(`/api/categories/${category.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.uncategorizedCount > 0) {
          showToast(`הקטגוריה נמחקה. ${result.uncategorizedCount} עסקאות הועברו ל"לא מסווג"`, 'success');
        } else {
          showToast('הקטגוריה נמחקה', 'success');
        }
        fetchCategories();
      } else {
        const error = await response.json();
        showToast(error.message || 'שגיאה במחיקה', 'error');
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      showToast('שגיאה במחיקת הקטגוריה', 'error');
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModal({ isOpen: false, category: null });
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">קטגוריות</h1>
          <p className="text-gray-600 mt-1">
            ניהול קטגוריות ומילות מפתח לסיווג אוטומטי
          </p>
        </div>
        <button
          onClick={handleAdd}
          disabled={isAdding}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="h-5 w-5" />
          הוסף קטגוריה
        </button>
      </div>

      {/* Add new category form */}
      {isAdding && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <h3 className="font-semibold text-green-800 mb-4">קטגוריה חדשה</h3>
          <CategoryForm
            formData={formData}
            setFormData={setFormData}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      )}

      {/* Categories grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((category) => (
          <div key={category.id}>
            {editingId === category.id ? (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h3 className="font-semibold text-blue-800 mb-4">עריכת קטגוריה</h3>
                <CategoryForm
                  formData={formData}
                  setFormData={setFormData}
                  onSave={handleSave}
                  onCancel={handleCancel}
                />
              </div>
            ) : (
              <div
                className="bg-white rounded-xl shadow-sm p-4 border-r-4 hover:shadow-md transition-shadow"
                style={{ borderRightColor: category.color || '#888' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                      style={{ backgroundColor: `${category.color}30` }}
                    >
                      {category.icon}
                    </span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{category.name}</h3>
                      {category.nameEn && (
                        <p className="text-xs text-gray-400">{category.nameEn}</p>
                      )}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    category.type === 'EXPENSE' ? 'bg-red-100 text-red-700' :
                    category.type === 'INCOME' ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {category.type === 'EXPENSE' ? 'הוצאה' :
                     category.type === 'INCOME' ? 'הכנסה' : 'העברה'}
                  </span>
                </div>

                <div className="text-sm text-gray-500 mb-3">
                  {category._count?.transactions || 0} תנועות · {category._count?.keywords || 0} מילות מפתח
                </div>

                {category.keywords && category.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {category.keywords.slice(0, 5).map((kw) => (
                      <span
                        key={kw.id}
                        className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                      >
                        {kw.keyword}
                      </span>
                    ))}
                    {category._count && category._count.keywords > 5 && (
                      <span className="px-2 py-0.5 text-gray-400 text-xs">
                        +{category._count.keywords - 5}
                      </span>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-2 border-t">
                  <button
                    onClick={() => handleEdit(category)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-lg text-sm"
                  >
                    <Pencil className="h-4 w-4" />
                    ערוך
                  </button>
                  <button
                    onClick={() => handleDeleteClick(category)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                    title="מחק"
                  >
                    <Trash2 className="h-4 w-4" />
                    מחק
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {categories.length === 0 && !isAdding && (
        <div className="bg-white rounded-xl p-8 text-center text-gray-500">
          אין קטגוריות. לחץ על "הוסף קטגוריה" כדי להתחיל.
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title="מחיקת קטגוריה"
        message={
          deleteModal.category
            ? deleteModal.category._count?.transactions
              ? `יש ${deleteModal.category._count.transactions} עסקאות בקטגוריה "${deleteModal.category.name}".\n\nאם תמחק את הקטגוריה, העסקאות האלה יהפכו ל"לא מסווגות".`
              : `האם למחוק את הקטגוריה "${deleteModal.category.name}"?`
            : ''
        }
        confirmText="מחק"
        cancelText="ביטול"
        variant={deleteModal.category?._count?.transactions ? 'warning' : 'danger'}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
}

interface CategoryFormProps {
  formData: {
    name: string;
    nameEn: string;
    icon: string;
    color: string;
    type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  };
  setFormData: React.Dispatch<React.SetStateAction<{
    name: string;
    nameEn: string;
    icon: string;
    color: string;
    type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  }>>;
  onSave: () => void;
  onCancel: () => void;
}

function CategoryForm({ formData, setFormData, onSave, onCancel }: CategoryFormProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [iconSearch, setIconSearch] = useState('');
  const [iconPickerStyle, setIconPickerStyle] = useState<CSSProperties>({});
  const iconButtonRef = useRef<HTMLButtonElement>(null);

  const filteredIconOptions = useMemo(() => {
    const query = iconSearch.trim().toLowerCase();
    if (!query) return ICON_OPTIONS;

    return ICON_OPTIONS.filter(option =>
      option.icon.includes(query)
      || option.label.toLowerCase().includes(query)
      || option.keywords.some(keyword => keyword.toLowerCase().includes(query))
    );
  }, [iconSearch]);

  useEffect(() => {
    if (!showEmojiPicker || !iconButtonRef.current) return;

    const updatePosition = () => {
      if (!iconButtonRef.current) return;

      const rect = iconButtonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 8;
      const preferredHeight = 520;
      const panelWidth = Math.min(380, viewportWidth - margin * 2);
      const spaceBelow = viewportHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const shouldOpenUpward = spaceBelow < 340 && spaceAbove > spaceBelow;
      const availableHeight = shouldOpenUpward ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(220, Math.min(preferredHeight, availableHeight - 8));

      let left = rect.left;
      if (left + panelWidth > viewportWidth - margin) {
        left = viewportWidth - margin - panelWidth;
      }
      if (left < margin) {
        left = margin;
      }

      const top = shouldOpenUpward
        ? Math.max(margin, rect.top - maxHeight - 4)
        : rect.bottom + 4;

      setIconPickerStyle({
        position: 'fixed',
        top,
        left,
        width: panelWidth,
        maxHeight,
        zIndex: 80,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showEmojiPicker]);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowEmojiPicker(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showEmojiPicker]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            שם הקטגוריה *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="לדוגמה: טיפוח אישי"
          />
        </div>

        {/* English name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            שם באנגלית
          </label>
          <input
            type="text"
            value={formData.nameEn}
            onChange={(e) => setFormData(prev => ({ ...prev, nameEn: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="לדוגמה: Personal Care"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            סוג
          </label>
          <select
            value={formData.type}
            onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as 'EXPENSE' | 'INCOME' | 'TRANSFER' }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="EXPENSE">הוצאה</option>
            <option value="INCOME">הכנסה</option>
            <option value="TRANSFER">העברה</option>
          </select>
        </div>

        {/* Icon */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            אייקון
          </label>
          <button
            ref={iconButtonRef}
            type="button"
            onClick={() => {
              setShowEmojiPicker(!showEmojiPicker);
              setShowColorPicker(false);
              if (!showEmojiPicker) {
                setIconSearch('');
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50"
          >
            <span className="text-2xl">{formData.icon}</span>
            <span className="text-gray-500 text-sm">לחץ לבחירה</span>
          </button>

          {showEmojiPicker && typeof window !== 'undefined' && createPortal(
            <>
              <div
                className="fixed inset-0 z-[70]"
                onClick={() => setShowEmojiPicker(false)}
              />
              <div
                style={iconPickerStyle}
                className="p-3 bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col overflow-hidden"
              >
                <div className="relative mb-2">
                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={iconSearch}
                    onChange={(e) => setIconSearch(e.target.value)}
                    placeholder="חיפוש אייקון..."
                    className="w-full pr-8 pl-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="mb-3">
                  <label className="block text-xs text-gray-500 mb-1">הדבק אייקון ידנית</label>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value.trim() || '📁' }))}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="למשל 🧠"
                  />
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                  {filteredIconOptions.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">לא נמצאו אייקונים</p>
                  ) : (
                    <div className="grid grid-cols-6 sm:grid-cols-8 gap-1">
                      {filteredIconOptions.map((option) => (
                        <button
                          key={`${option.icon}-${option.label}`}
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, icon: option.icon }));
                            setShowEmojiPicker(false);
                          }}
                          title={option.label}
                          className={`
                            text-2xl p-1.5 rounded hover:bg-gray-100 transition-colors
                            ${formData.icon === option.icon ? 'bg-blue-50 ring-1 ring-blue-200' : ''}
                          `}
                        >
                          {option.icon}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-500 mt-2">
                  {filteredIconOptions.length} אייקונים זמינים
                </p>
              </div>
            </>,
            document.body
          )}
        </div>

        {/* Color */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            צבע
          </label>
          <button
            type="button"
            onClick={() => {
              setShowColorPicker(!showColorPicker);
              setShowEmojiPicker(false);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50"
          >
            <div
              className="w-6 h-6 rounded-full border border-gray-200"
              style={{ backgroundColor: formData.color }}
            />
            <span className="text-gray-500 text-sm">לחץ לבחירה</span>
          </button>

          {showColorPicker && (
            <div className="absolute right-0 z-10 mt-1 p-2 bg-white border border-gray-200 rounded-lg shadow-lg grid grid-cols-5 gap-1">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, color }));
                    setShowColorPicker(false);
                  }}
                  className="w-8 h-8 rounded-full border-2 border-white hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="flex items-center gap-3 p-3 bg-white/50 rounded-lg">
        <span className="text-sm text-gray-500">תצוגה מקדימה:</span>
        <span
          className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
          style={{ backgroundColor: `${formData.color}30` }}
        >
          {formData.icon}
        </span>
        <span className="font-medium">{formData.name || 'שם הקטגוריה'}</span>
      </div>

      {/* Actions */}
      <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end">
        <button
          onClick={onCancel}
          className="w-full sm:w-auto px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
        >
          <X className="h-4 w-4" />
          ביטול
        </button>
        <button
          onClick={onSave}
          className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
        >
          <Save className="h-4 w-4" />
          שמור
        </button>
      </div>
    </div>
  );
}
