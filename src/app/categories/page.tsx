'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react';
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

// Emoji picker options
const EMOJI_OPTIONS = [
  '🛒', '🍽️', '🚗', '⛽', '🏠', '💡', '📱', '🎬', '👕', '💊',
  '🎓', '✈️', '🎁', '💰', '📦', '🔧', '🎨', '🏋️', '🐕', '👶',
  '💇', '📚', '🎵', '🎮', '☕', '🍕', '🚌', '🏥', '💼', '🛍️'
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">קטגוריות</h1>
          <p className="text-gray-600 mt-1">
            ניהול קטגוריות ומילות מפתח לסיווג אוטומטי
          </p>
        </div>
        <button
          onClick={handleAdd}
          disabled={isAdding}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
            type="button"
            onClick={() => {
              setShowEmojiPicker(!showEmojiPicker);
              setShowColorPicker(false);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50"
          >
            <span className="text-2xl">{formData.icon}</span>
            <span className="text-gray-500 text-sm">לחץ לבחירה</span>
          </button>

          {showEmojiPicker && (
            <div className="absolute z-10 mt-1 p-2 bg-white border border-gray-200 rounded-lg shadow-lg grid grid-cols-6 gap-1 max-h-48 overflow-y-auto">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, icon: emoji }));
                    setShowEmojiPicker(false);
                  }}
                  className="text-2xl p-2 hover:bg-gray-100 rounded"
                >
                  {emoji}
                </button>
              ))}
            </div>
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
            <div className="absolute z-10 mt-1 p-2 bg-white border border-gray-200 rounded-lg shadow-lg grid grid-cols-5 gap-1">
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
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
        >
          <X className="h-4 w-4" />
          ביטול
        </button>
        <button
          onClick={onSave}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Save className="h-4 w-4" />
          שמור
        </button>
      </div>
    </div>
  );
}
