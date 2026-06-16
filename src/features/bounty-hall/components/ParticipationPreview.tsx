import { UserAvatar } from "../../../components/UserAvatar";
import type { ObjectiveParticipantProfile } from "../../../types/orf";
import type { BountyItem } from "../model/bountyHallTypes";

export function ParticipationPreview({ currentUserId, currentUserName, item }: { currentUserId: string; currentUserName: string; item: BountyItem }) {
  const applicationReasons = item.applications.filter((application) => application.status !== "declined" && application.reason?.trim());
  const challengerPeople = participantPeople(item.objective.challengerProfiles, item.challengers);
  const assignedPeople = participantPeople(item.objective.assignedChallengerProfiles, item.assignedChallengers).filter((person) => !item.challengers.includes(person.name));
  const hasParticipationState = challengerPeople.length > 0 || assignedPeople.length > 0 || item.pendingApplications.length > 0;

  return (
    <div className="bounty-participants">
      {challengerPeople.length > 0 ? (
        <div className="bounty-participant-line">
          <span>挑战者</span>
          <BountyAvatarStack currentUserName={currentUserName} people={challengerPeople} />
        </div>
      ) : null}
      {assignedPeople.length > 0 ? (
        <div className="bounty-participant-line">
          <span>待响应征召</span>
          <BountyAvatarStack currentUserName={currentUserName} people={assignedPeople} variant="recruitment" />
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
      {!hasParticipationState && <span className="bounty-participants-empty">等待申请</span>}
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

type BountyAvatarPerson = {
  avatarUrl?: string | null;
  name: string;
  userId?: string | null;
};

function participantPeople(profiles: ObjectiveParticipantProfile[] | undefined, names: string[]): BountyAvatarPerson[] {
  if (profiles && profiles.length > 0) {
    return profiles.map((profile) => ({
      avatarUrl: profile.avatarUrl ?? null,
      name: profile.name,
      userId: profile.userId ?? null,
    }));
  }

  return names.map((name) => ({ name }));
}

function BountyAvatarStack({ currentUserName, people, variant }: { currentUserName: string; people: BountyAvatarPerson[]; variant?: "recruitment" }) {
  if (people.length === 0) return null;
  const orderedPeople = orderCurrentUserFirst(people, currentUserName);

  return (
    <div className="bounty-avatar-stack" data-variant={variant}>
      {orderedPeople.slice(0, 4).map((person, index) => (
        <UserAvatar
          key={person.userId ?? person.name}
          aria-label={person.name === currentUserName ? `你，${person.name}` : person.name}
          avatarUrl={person.avatarUrl ?? null}
          className="bounty-avatar"
          data-current-user={person.name === currentUserName ? "true" : undefined}
          data-offset={index > 0 ? "true" : undefined}
          frame={false}
          name={person.name}
          size="sm"
          title={person.name === currentUserName ? `你 · ${person.name}` : person.name}
        />
      ))}
      {orderedPeople.length > 4 && <span className="bounty-avatar-more">+{orderedPeople.length - 4}</span>}
    </div>
  );
}

function orderCurrentUserFirst(people: BountyAvatarPerson[], currentUserName: string) {
  if (!currentUserName) return people;
  const currentUserPeople = people.filter((person) => person.name === currentUserName);
  if (currentUserPeople.length === 0) return people;
  return [...currentUserPeople, ...people.filter((person) => person.name !== currentUserName)];
}
