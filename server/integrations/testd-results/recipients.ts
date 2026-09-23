import { pool } from "../../db/client";

const recipientEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function resolveTestdRecipientUserIds(teamId: string, emails: readonly string[]): Promise<string[]> {
  const normalized = [...new Set(emails.map(email => email.trim().toLowerCase()))];
  if (normalized.length === 0 || normalized.some(email => !recipientEmailPattern.test(email))) {
    throw new Error("TestD 系统通知收件邮箱无效");
  }
  const { rows } = await pool.query<{ email: string; id: string }>(
    `SELECT lower(trim(u.email)) AS email, u.id::text
       FROM team_members tm
       INNER JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1
        AND COALESCE(u.status, 'active') = 'active'
        AND lower(trim(u.email)) = ANY($2::text[])`,
    [teamId, normalized],
  );
  const userIds = normalized.map(email => {
    const matches = rows.filter(row => row.email === email);
    if (matches.length !== 1) throw new Error(`TestD 系统通知收件邮箱未匹配到唯一活动团队成员：${email}`);
    return matches[0]!.id;
  });
  if (new Set(userIds).size !== normalized.length) throw new Error("TestD 系统通知收件邮箱对应重复的团队成员");
  return userIds;
}
