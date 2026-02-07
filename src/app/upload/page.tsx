import { FileUploadZone } from '@/components/upload/FileUploadZone';

export default function UploadPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">העלאת קבצים</h1>
        <p className="text-gray-600 mt-1">
          העלה קבצי תנועות מהבנק או מחברת האשראי שלך
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <FileUploadZone />
      </div>

      <div className="mt-8 bg-blue-50 rounded-lg p-4">
        <h3 className="font-medium text-blue-900">איך להוריד קובץ תנועות?</h3>
        <div className="mt-3 space-y-2 text-sm text-blue-800">
          <p><strong>בנק הפועלים:</strong> היכנס לחשבון → תנועות בחשבון → ייצוא לאקסל</p>
          <p><strong>בנק לאומי:</strong> היכנס לחשבון → פעולות בחשבון → הורדה לאקסל</p>
          <p><strong>ישראכרט:</strong> היכנס לאתר → פירוט חיובים → ייצוא לאקסל</p>
          <p><strong>לאומי קארד:</strong> היכנס לאתר → פירוט עסקאות → ייצוא</p>
        </div>
      </div>
    </div>
  );
}
