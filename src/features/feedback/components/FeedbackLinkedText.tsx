import { Link } from "react-router-dom";
import { parseFeedbackTextLinks } from "../model/feedbackTextLinks";

export function FeedbackLinkedText({ text }: { text: string }) {
  return (
    <>
      {parseFeedbackTextLinks(text).map((token, index) => {
        if (token.type === "internalLink") {
          return <Link key={`${token.href}-${index}`} className="feedback-text-link" to={token.href}>{token.text}</Link>;
        }

        if (token.type === "externalLink") {
          return <a key={`${token.href}-${index}`} className="feedback-text-link" href={token.href} rel="noreferrer noopener" target="_blank">{token.text}</a>;
        }

        return <span key={`${token.text}-${index}`}>{token.text}</span>;
      })}
    </>
  );
}
