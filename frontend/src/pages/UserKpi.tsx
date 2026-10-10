import UserKpiPanel from '../components/UserKpiPanel'

// User KPI as its own page: for the privileged roles, who have no Admin Panel
// (admins open the same list from the Admin Panel's "User KPI" tab).
export default function UserKpi() {
  return (
    <>
      <div className="topbar">
        <div>
          <h1>User KPI</h1>
          <div className="crumb">Task completion and on-time delivery of every employee</div>
        </div>
      </div>
      <UserKpiPanel />
    </>
  )
}
