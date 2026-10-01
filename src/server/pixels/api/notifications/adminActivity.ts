import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';

const actions: Record<string, string> = { save: 'saved', create: 'created', update: 'updated', delete: 'deleted', remove: 'removed', upload: 'uploaded', approve: 'approved', reject: 'rejected', reorder: 'reordered', rotate: 'rotated', revoke: 'revoked', publish: 'published', unpublish: 'unpublished', duplicate: 'duplicated', fulfill: 'fulfilled', 'mark-unavailable': 'marked unavailable', 'mark-sold': 'marked sold', 'reverse-sold': 'returned to inventory', restore: 'restored', record: 'recorded', void: 'voided', retry: 'retried', 'set-role': 'role updated', 'set-status': 'status updated', set: 'updated', 'update-status': 'status updated', commit: 'imported' };
const subjects: Record<string, string> = { numbers: 'Numbers', 'private-links': 'Offline catalog link', 'dealer-purchases': 'Dealer purchases', 'home-premium': 'Premium homepage', 'deals-of-day': 'Lucky Picks', 'trusted-clients': 'Trusted clients', faqs: 'FAQs', carousel: 'Carousel', settings: 'Store settings', 'review-screenshots': 'Review screenshots', 'prebook-refunds': 'Pre-book refunds' };

export function describeAdminActivity(path: string, payload: any, result: any) {
  const parts = path.split('/').filter(Boolean);
  const action = actions[parts[parts.length - 1]] || (['kyc', 'moderate'].includes(parts[parts.length - 1]) ? 'updated' : undefined);
  if (!action || result?.status !== 1 || (parts.includes('import') && !result.data?.imported)) return null;
  const subject = subjects[parts[0]] || parts[0]?.replace(/-/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) || 'Admin record';
  const reference = payload.name || payload.display_number || payload.order_id || payload.client_id || payload.number_id || payload.target_id;
  const detail = parts.includes('import') ? `${result.data.imported} numbers imported.` : `${subject}${reference ? ` (${String(reference).slice(0, 100)})` : ''} ${action}.`;
  return { title: `${subject} ${action}`, message: detail };
}

/** Staff see admin activity. Existing business notifications still go to affected customers. */
export async function notifyAdminActivity(path: string, payload: any, result: any) {
  const activity = describeAdminActivity(path, payload, result);
  if (!activity || !payload.user_id) return;
  try {
    const dao = new MySqlClient('pixels');
    const query: any = await dao.executeQuery(`INSERT INTO notifications (user_id,sender_id,type,title,message,is_read)
      SELECT user_id,?,'admin_activity',?,?,'false' FROM auth_user WHERE (role IN ('ADMIN','EMPLOYEE') AND status='ACTIVE') OR user_id=?`,
      [payload.user_id, activity.title, activity.message, payload.user_id]);
    if (query.status !== 1) new Logger().error('Admin activity notification failed: ' + query.info);
  } catch (error) { new Logger().error('Admin activity notification failed: ' + error); }
}
