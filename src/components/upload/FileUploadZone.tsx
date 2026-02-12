'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileSpreadsheet, Check, AlertCircle, Loader2, X, File, ArrowLeft, BarChart3, Trash2 } from 'lucide-react';
import { Institution } from '@prisma/client';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface FileUploadResult {
  fileName: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  institution?: Institution;
  accountName?: string;
  rowCount?: number;
  total?: number;
  imported?: number;
  duplicates?: number;
  skippedRows?: number;
  error?: string;
}

const institutionLabels: Record<Institution, string> = {
  BANK_HAPOALIM: 'בנק הפועלים',
  BANK_LEUMI: 'בנק לאומי',
  ISRACARD: 'ישראכרט',
  LEUMI_CARD: 'לאומי קארד',
  OTHER: 'אחר'
};

export function FileUploadZone() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | ''>('');
  const [uploadResults, setUploadResults] = useState<FileUploadResult[]>([]);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleUploadMultiple(files);
    }
  }, [selectedInstitution]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      handleUploadMultiple(files);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [selectedInstitution]);

  const handleUploadMultiple = async (files: File[]) => {
    // Add all files to results with pending status
    const newResults: FileUploadResult[] = files.map(file => ({
      fileName: file.name,
      status: 'pending'
    }));

    setUploadResults(prev => [...newResults, ...prev]);

    // Upload files in parallel
    await Promise.all(
      files.map((file, index) => uploadSingleFile(file, index))
    );
  };

  const uploadSingleFile = async (file: File, resultIndex: number) => {
    // Update status to uploading
    setUploadResults(prev => {
      const updated = [...prev];
      updated[resultIndex] = { ...updated[resultIndex], status: 'uploading' };
      return updated;
    });

    const formData = new FormData();
    formData.append('file', file);
    if (selectedInstitution) {
      formData.append('institution', selectedInstitution);
    }

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      setUploadResults(prev => {
        const updated = [...prev];
        if (response.ok) {
          updated[resultIndex] = {
            fileName: file.name,
            status: 'success',
            institution: data.institution,
            accountName: data.accountName,
            rowCount: data.rowCount,
            total: data.total,
            imported: data.imported,
            duplicates: data.duplicates,
            skippedRows: data.skippedRows
          };
        } else {
          updated[resultIndex] = {
            fileName: file.name,
            status: 'error',
            error: data.error || 'שגיאה בהעלאת הקובץ'
          };
        }
        return updated;
      });
    } catch (error) {
      setUploadResults(prev => {
        const updated = [...prev];
        updated[resultIndex] = {
          fileName: file.name,
          status: 'error',
          error: 'שגיאה בהתחברות לשרת'
        };
        return updated;
      });
    }
  };

  const removeResult = (index: number) => {
    setUploadResults(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllResults = () => {
    setUploadResults([]);
  };

  const handleResetDatabase = async () => {
    setIsResetting(true);
    try {
      const response = await fetch('/api/reset', { method: 'DELETE' });
      if (response.ok) {
        setUploadResults([]);
        setShowResetModal(false);
        router.refresh();
      }
    } catch (error) {
      console.error('Reset failed:', error);
    } finally {
      setIsResetting(false);
    }
  };

  const isAnyUploading = uploadResults.some(r => r.status === 'uploading' || r.status === 'pending');
  const hasSuccessfulUploads = uploadResults.some(r => r.status === 'success' && (r.imported || 0) > 0);
  const totalImported = uploadResults.reduce((sum, r) => sum + (r.imported || 0), 0);

  return (
    <div className="space-y-6">
      {/* Institution selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          בחר מוסד פיננסי (אופציונלי - יזוהה אוטומטית)
        </label>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(institutionLabels).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSelectedInstitution(selectedInstitution === key ? '' : key as Institution)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                selectedInstitution === key
                  ? 'bg-blue-50 border-blue-500 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Upload zone - always accessible */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-6 sm:p-12 text-center transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-white hover:border-gray-400'
        }`}
      >
        <input
          type="file"
          accept=".csv,.xlsx,.xls,.pdf"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          multiple
        />

        <div className="flex flex-col items-center">
          <div className="p-4 bg-gray-100 rounded-full">
            <Upload className="h-8 w-8 text-gray-500" />
          </div>
          <p className="mt-4 text-lg font-medium text-gray-700">
            גרור קבצים לכאן או לחץ לבחירה
          </p>
          <p className="mt-2 text-sm text-gray-500">
            ניתן להעלות מספר קבצים במקביל
          </p>
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
            <FileSpreadsheet className="h-4 w-4" />
            <span>CSV, XLS, XLSX, PDF</span>
          </div>
        </div>
      </div>

      {/* Reset Database Button */}
      <div className="flex justify-stretch sm:justify-end">
        <button
          onClick={() => setShowResetModal(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          מחיקת כל הנתונים
        </button>
      </div>

      <ConfirmModal
        isOpen={showResetModal}
        title="מחיקת כל הנתונים"
        message="פעולה זו תמחק את כל התנועות, החשבונות והקבצים שהועלו. הקטגוריות ומילות המפתח יישמרו. פעולה זו אינה ניתנת לביטול."
        confirmText={isResetting ? 'מוחק...' : 'מחק הכל'}
        cancelText="ביטול"
        variant="danger"
        onConfirm={handleResetDatabase}
        onCancel={() => setShowResetModal(false)}
      />

      {/* Upload Results */}
      {uploadResults.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <h3 className="font-medium text-gray-700">תוצאות העלאה</h3>
            {!isAnyUploading && (
              <button
                onClick={clearAllResults}
                className="text-sm text-gray-500 hover:text-gray-700 self-end sm:self-auto"
              >
                נקה הכל
              </button>
            )}
          </div>

          {/* Action buttons after upload */}
          {!isAnyUploading && uploadResults.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              {hasSuccessfulUploads ? (
                <>
                  <button
                    onClick={() => router.push('/')}
                    className="w-full sm:flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    <BarChart3 className="h-5 w-5" />
                    צפה בדשבורד ({totalImported} תנועות חדשות)
                  </button>
                  <button
                    onClick={() => router.push('/transactions')}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <ArrowLeft className="h-5 w-5" />
                    תנועות
                  </button>
                </>
              ) : (
                <div className="flex-1 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                  לא יובאו תנועות חדשות. ודא שהקבצים הם בפורמט הנכון (Excel/CSV מהבנק או חברת האשראי)
                </div>
              )}
            </div>
          )}

          {uploadResults.map((result, index) => (
            <div
              key={`${result.fileName}-${index}`}
              className={`rounded-lg p-4 border ${
                result.status === 'success'
                  ? 'bg-green-50 border-green-200'
                  : result.status === 'error'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {result.status === 'uploading' || result.status === 'pending' ? (
                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin mt-0.5" />
                  ) : result.status === 'success' ? (
                    <Check className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <File className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-gray-800 truncate">{result.fileName}</span>
                    </div>

                    {result.status === 'uploading' && (
                      <p className="text-sm text-blue-600 mt-1">מעבד...</p>
                    )}
                    {result.status === 'pending' && (
                      <p className="text-sm text-gray-500 mt-1">ממתין...</p>
                    )}

                    {result.status === 'success' && (
                      <div className="text-sm mt-1 space-y-0.5">
                        {(result.imported || 0) > 0 ? (
                          <>
                            <p className="text-green-700 font-medium">
                              {result.accountName || (result.institution && institutionLabels[result.institution])} — יובאו {result.imported} תנועות
                            </p>
                            <p className="text-gray-500 text-xs">
                              {result.rowCount} שורות בקובץ
                              {' → '}{result.total} תנועות זוהו
                              {result.duplicates && result.duplicates > 0 && (
                                <span> | {result.duplicates} כפילויות</span>
                              )}
                              {result.skippedRows && result.skippedRows > 0 && (
                                <span> | {result.skippedRows} שורות סיכום/כותרת</span>
                              )}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-amber-600">
                              לא נמצאו תנועות חדשות בקובץ
                            </p>
                            <p className="text-gray-500 text-xs">
                              {result.total && result.total > 0 ? (
                                <span>
                                  {result.total} תנועות בקובץ — כולן כפילויות ({result.duplicates})
                                </span>
                              ) : (
                                <span>ייתכן שפורמט הקובץ לא מוכר</span>
                              )}
                            </p>
                          </>
                        )}
                      </div>
                    )}

                    {result.status === 'error' && (
                      <p className="text-sm text-red-700 mt-1">{result.error}</p>
                    )}
                  </div>
                </div>

                {(result.status === 'success' || result.status === 'error') && (
                  <button
                    onClick={() => removeResult(index)}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
