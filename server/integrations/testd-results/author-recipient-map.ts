/** Confirmed Git commit author addresses and their ORF account addresses. */
export const authorRecipientEmails: Readonly<Record<string, string>> = Object.freeze({
  "1243162387@qq.com": "1243162387@qq.com",
  "474746922@qq.com": "xueyu@qq.com",
  "492606214@qq.com": "douyaj33@gmail.com",
  "731705278@qq.com": "zrx@sdr.com",
  "872294056@qq.com": "543@sd.com",
  "dengbh@sdr.com": "934141435@qq.com",
  "fengc@qq.com": "2318126845@qq.com",
  "fengc@sdrising.com": "2318126845@qq.com",
  "huangyk@sdrising.com": "huangyanke@sdrising.com",
  "tangyl@sdrising.com": "tangyl@sdrising.com",
  "wangxin@sdrising.com": "wangxin@qq.com",
  "wuyz@sdrising.com": "wuyuzhi@sdr.com",
  "xiawei@localhost.localdomain": "1243162387@qq.com",
  "xueuy@qq.com": "xueyu@qq.com",
  "zhangxiao@sdrising.com": "douyaj33@gmail.com",
  "zhurx@sdrising.com": "zrx@sdr.com",
});

export function orfRecipientEmail(authorEmail: string): string {
  const recipient = authorRecipientEmails[authorEmail.trim().toLowerCase()];
  if (!recipient) throw new Error("Git 提交作者邮箱未配置 ORF 收件人映射");
  return recipient;
}
