import { sendEmail } from "../server/notifications/email";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length).trim() : "";
}

function defaultBody() {
  return [
    "ORF 系统通知",
    "",
    "状态：已完成",
    "",
    "本次更新已完成并通过验证：",
    "- ORF 状态机、注册审核、结构化战利品和积分结算已落地。",
    "- 邮件功能已作为独立模块接入，可通过 npm run notify:email 发送系统邮件。",
    "- 前端开发服务：http://localhost:5173/",
    "- 后端服务：http://127.0.0.1:8787/",
    "",
    `发送时间：${new Date().toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}`,
  ].join("\n");
}

async function main() {
  const subject = argValue("subject") || "ORF 系统通知：开发任务已完成";
  const text = argValue("text") || defaultBody();

  const result = await sendEmail({ subject, text });
  console.log(`Email sent: ${result.messageId}`);
  if (result.rejected.length > 0) {
    console.warn(`Rejected recipients: ${result.rejected.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
