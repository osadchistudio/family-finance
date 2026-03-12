'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { showToast } from '@/components/ui/Toast';

type UploadSource = 'WEB' | 'TELEGRAM';
type UploadStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface RecentUploadItem {
  id: string;
  filename: string;
  rowCount: number;
  status: UploadStatus;
  source: UploadSource;
  processedAt: string;
  accountName: string;
  transactionCount: number;
}

interface RecentUploadsListProps {
  recentUploads: RecentUploadItem[];
}

const sourceLabels: Record<UploadSource, string> = {
  WEB: 'אתר',
  TELEGRAM: 'טלגרם',
};

const sourceClasses: Record<UploadSource, string> = {
  WEB: 'bg-slate-100 text-slate-700',
  TELEGRAM: 'bg-sky-100 text-sky-700',
};

const statusLabels: Record<UploadStatus, string> = {
  PENDING: 'ממתין',
  PROCESSING: 'מעבד',
  COMPLETED: 'הושלם',
  FAILED: 'נכשל',
};

export function RecentUploadsList({ recentUploads }: RecentUploadsListProps) {
  const router = useRouter();
  const [uploads, setUploads] = useState(recentUploads);
  const [uploadToDelete, setUploadToDelete] = useState<RecentUploadItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteMessage = useMemo(() => {
    if (!uploadToDelete) return '';

    return [
      `קובץ: ${uploadToDelete.filename}`,
      `מקור: ${sourceLabels[uploadToDelete.source]}`,
      `חשבון: ${uploadToDelete.accountName}`,
      `שעת העלאה: ${new Date(uploadToDelete.processedAt).toLocaleString('he-IL')}`,
      `תנועות שמקושרות כרגע להעלאה הזו: ${uploadToDelete.transactionCount}`,
      '',
      'המערכת תמחק רק את התנועות שמקושרות להעלאה הזאת ואת רשומת ההעלאה עצמה.',
      'תנועות מהעלאות אחרות, תנועות ידניות וכפילויות שדולגו לא יימחקו.',
      '',
      'אם יש הערות או תיקונים על תנועות ששייכות להעלאה הזו, גם הם יימחקו יחד איתן.',
    ].join('\n');
  }, [uploadToDelete]);

  const handleDelete = async () => {
    if (!uploadToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/upload/${uploadToDelete.id}`, {
        method: 'DELETE',
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || 'Failed to delete upload');
      }

      setUploads((current) => current.filter((upload) => upload.id !== uploadToDelete.id));
      setUploadToDelete(null);
      router.refresh();

      showToast(
        result?.deletedTransactions > 0
          ? `ההעלאה נמחקה יחד עם ${result.deletedTransactions} תנועות מקושרות`
          : 'רשומת ההעלאה נמחקה. לא היו תנועות מקושרות למחיקה',
        'success'
      );
    } catch (error) {
      console.error('Delete upload failed:', error);
      showToast('שגיאה במחיקת ההעלאה', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">העלאות אחרונות</h2>
          <p className="text-sm text-gray-500 mt-1">
            היסטוריית העלאות אחרונה כולל מקור ההעלאה
          </p>
        </div>
        <span className="text-sm text-gray-400">{uploads.length} רשומות</span>
      </div>

      {uploads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">
          עדיין אין היסטוריית העלאות להצגה
        </div>
      ) : (
        <div className="space-y-3">
          {uploads.map((upload) => (
            <div
              key={upload.id}
              className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900 break-all">{upload.filename}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${sourceClasses[upload.source]}`}
                    >
                      {sourceLabels[upload.source]}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    {upload.accountName} | {upload.rowCount} שורות בקובץ | {upload.transactionCount}{' '}
                    תנועות מקושרות | {new Date(upload.processedAt).toLocaleString('he-IL')}
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {statusLabels[upload.status] || upload.status}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setUploadToDelete(upload)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  מחק העלאה
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={!!uploadToDelete}
        title="מחיקת העלאה"
        message={deleteMessage}
        confirmText={isDeleting ? 'מוחק...' : 'מחק העלאה'}
        cancelText="ביטול"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => {
          if (!isDeleting) setUploadToDelete(null);
        }}
      />
    </>
  );
}
