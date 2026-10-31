import TeamWorkspace from '../shared/TeamWorkspace';

export default function StaffWorkspace({ userName, onSignOut }: { userName: string; onSignOut: () => void }) {
  return <TeamWorkspace role="staff" userName={userName} onSignOut={onSignOut} />;
}
