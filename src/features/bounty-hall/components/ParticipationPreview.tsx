import { avatarStyleForName } from "../../../utils/avatar";
import { initials } from "../../../utils/format";
import type { BountyItem } from "../model/bountyHallTypes";

export function ParticipationPreview({ currentUserId, currentUserName, item }: { currentUserId: string; currentUserName: string; item: BountyItem }) {
  const applicationReasons = item.applications.filter((application) => application.status !== "declined" && application.reason?.trim());

  return (
    <div className="bounty-participants">
      {item.challengers.length > 0 ? (
        <div className="bounty-participant-line">
          <span>挑战者</span>
          <BountyAvatarStack currentUserName={currentUserName} names={item.challengers} />
        </div>
      ) : null}
      {item.pendingApplications.length > 0 ? (
        <div className="bounty-participant-line">
          <span>申请中</span>
          <div className="bounty-applicant-list">
            {item.pendingApplications.slice(0, 2).map((application) => {
              const isCurrentUser = application.applicantUserId === currentUserId;
              return (
                <span
                  key={application.id}
                  className="bounty-applicant-pill"
                  data-current-user={isCurrentUser ? "true" : undefined}
                  title={application.reason || application.applicant}
                >
                  {isCurrentUser ? `你 · ${application.applicant}` : application.applicant}
                </span>
              );
            })}
            {item.pendingApplications.length > 2 && <span className="bounty-applicant-more">+{item.pendingApplications.length - 2}</span>}
          </div>
        </div>
      ) : null}
      {item.challengers.length === 0 && item.pendingApplications.length === 0 && <span className="bounty-participants-empty">等待申请</span>}
      {applicationReasons.length > 0 && (
        <div className="bounty-application-reasons" aria-label="申请理由">
          {applicationReasons.slice(0, 3).map((application) => (
            <div key={application.id} className="bounty-application-reason">
              <strong>{application.applicant}</strong>
              <span>{application.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BountyAvatarStack({ currentUserName, names }: { currentUserName: string; names: string[] }) {
  if (names.length === 0) return null;
  const orderedNames = orderCurrentUserFirst(names, currentUserName);

  return (
    <div className="bounty-avatar-stack">
      {orderedNames.slice(0, 4).map((name, index) => (
        <span
          key={name}
          aria-label={name === currentUserName ? `你，${name}` : name}
          className="bounty-avatar"
          data-current-user={name === currentUserName ? "true" : undefined}
          data-offset={index > 0 ? "true" : undefined}
          style={avatarStyleForName(name)}
          title={name === currentUserName ? `你 · ${name}` : name}
        >
          {initials(name)}
        </span>
      ))}
      {orderedNames.length > 4 && <span className="bounty-avatar-more">+{orderedNames.length - 4}</span>}
    </div>
  );
}

function orderCurrentUserFirst(names: string[], currentUserName: string) {
  if (!currentUserName) return names;
  const currentUserNames = names.filter((name) => name === currentUserName);
  if (currentUserNames.length === 0) return names;
  return [...currentUserNames, ...names.filter((name) => name !== currentUserName)];
}
