function windowsNotificationToastXml(input) {
  const avatarImage = input.avatarImageUri
    ? `<image placement="appLogoOverride" src="${escapeXmlAttribute(input.avatarImageUri)}" alt="${escapeXmlAttribute(input.avatarAlt || input.title)}" hint-crop="circle"/>`
    : "";
  const durationAttribute = input.duration === "long" || input.duration === "short"
    ? ` duration="${input.duration}"`
    : "";
  return [
    `<toast${durationAttribute} launch="${escapeXmlAttribute(input.activationArguments)}">`,
    "<visual>",
    '<binding template="ToastGeneric">',
    avatarImage,
    `<text>${escapeXmlText(input.title)}</text>`,
    `<text>${escapeXmlText(input.body)}</text>`,
    "</binding>",
    "</visual>",
    "</toast>",
  ].join("");
}

function escapeXmlAttribute(value) {
  return escapeXmlText(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function escapeXmlText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = {
  windowsNotificationToastXml,
};
