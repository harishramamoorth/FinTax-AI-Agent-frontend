import TeamWorkspace from '../shared/TeamWorkspace';

export default function AdminWorkspace({ userName, onSignOut }: { userName: string; onSignOut: () => void }) {
  return <TeamWorkspace role="admin" userName={userName} onSignOut={onSignOut} />;
}
