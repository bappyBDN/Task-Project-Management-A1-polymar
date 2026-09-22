"""Load a rich set of dummy data for testing every screen.

Idempotent: skips if dummy data is already present (checks for a marker project).
Run:  .\\.venv\\Scripts\\python.exe -m app.dummy_data
"""
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app import models
from app.database import SessionLocal


def _task(db, **kw):
    t = models.Task(
        code=kw.get("code") or f"TSK-{1000 + db.query(models.Task).count()}",
        **kw,
    )
    db.add(t)
    return t


def load(db: Session):
    if db.query(models.Project).filter(models.Project.code == "PRJ-0099").count() > 0:
        print("Dummy data already present — skipping.")
        return

    today = date.today()

    # Ensure base org exists
    if db.query(models.Company).count() == 0:
        print("No base data. Run seed first (start the app once).")
        return

    group = db.query(models.Company).filter_by(code="ANW").first()
    cement = db.query(models.Company).filter_by(code="ACL").first()
    galv = db.query(models.Company).filter_by(code="AGL").first()

    fns = {f.code: f for f in db.query(models.Function).all()}
    ops = fns.get("OPS")
    fin = fns.get("FIN")
    sm = fns.get("S&M")
    itd = fns.get("ITD")
    scm = fns.get("SCM")
    hr = fns.get("HR")

    # Additional users
    new_users = [
        models.User(employee_id="E010", name="Ayesha Siddiqua", email="ayesha@anwarcement.com", designation="Plant Engineer", role="employee", company_id=cement.id if cement else None, function_id=ops.id if ops else None),
        models.User(employee_id="E011", name="Mahmudul Hasan", email="mahmud@anwarcement.com", designation="Maintenance Lead", role="team_lead", company_id=cement.id if cement else None, function_id=ops.id if ops else None),
        models.User(employee_id="E012", name="Rashida Akter", email="rashida@anwargroup.com", designation="Financial Analyst", role="employee", company_id=group.id if group else None, function_id=fin.id if fin else None),
        models.User(employee_id="E013", name="Shafiqul Islam", email="shafiqul@anwargroup.com", designation="IT Manager", role="pm", company_id=group.id if group else None, function_id=itd.id if itd else None),
        models.User(employee_id="E014", name="Nasrin Sultana", email="nasrin@anwargroup.com", designation="HRBP", role="employee", company_id=group.id if group else None, function_id=hr.id if hr else None),
        models.User(employee_id="E015", name="Kazi Rafiq", email="rafiq@anwargalv.com", designation="Supply Chain Head", role="functional_head", company_id=galv.id if galv else None, function_id=scm.id if scm else None),
        models.User(employee_id="E016", name="Sumaiya Akter", email="sumaiya@anwarcement.com", designation="Sales Executive", role="employee", company_id=cement.id if cement else None, function_id=sm.id if sm else None),
    ]
    db.add_all(new_users)
    db.flush()

    all_users = db.query(models.User).order_by(models.User.id).all()
    umap = {u.employee_id: u for u in all_users}
    U = lambda code: umap.get(code)

    # Programs
    prog2 = models.Program(name="Digital Excellence 2027", company_id=group.id if group else None)
    prog3 = models.Program(name="Supply Chain Resilience", company_id=galv.id if galv else None)
    db.add_all([prog2, prog3])
    db.flush()

    # Projects
    projects = [
        models.Project(code="PRJ-0099", name="Dummy — Full Test Dataset", company_id=group.id if group else None, project_type="operational", status="active", health="green", methodology="hybrid",
                       sponsor_id=U("E001").id if U("E001") else None, manager_id=U("E004").id if U("E004") else None,
                       start_date=today - timedelta(days=120), baseline_due_date=today + timedelta(days=240),
                       approved_due_date=today + timedelta(days=240), completion_pct=35.0, priority="medium"),
        models.Project(code="PRJ-0003", name="ERP Implementation", company_id=group.id if group else None, function_id=itd.id if itd else None, program_id=prog2.id,
                       sponsor_id=U("E001").id if U("E001") else None, manager_id=U("E013").id if U("E013") else None, owner_id=U("E013").id if U("E013") else None,
                       objective="Roll out group-wide ERP.", project_type="transformation", priority="high", methodology="waterfall",
                       start_date=today - timedelta(days=90), baseline_due_date=today + timedelta(days=300),
                       approved_due_date=today + timedelta(days=300), forecast_due_date=today + timedelta(days=330),
                       completion_pct=22.0, status="active", health="amber", budget=45_000_000, criticality="high"),
        models.Project(code="PRJ-0004", name="Cost Optimization Program", company_id=cement.id if cement else None, function_id=fin.id if fin else None,
                       sponsor_id=U("E002").id if U("E002") else None, manager_id=U("E003").id if U("E003") else None,
                       objective="Reduce opex by 10%.", project_type="strategic", priority="high", methodology="kanban",
                       start_date=today - timedelta(days=45), baseline_due_date=today + timedelta(days=150),
                       approved_due_date=today + timedelta(days=150), completion_pct=55.0, status="active", health="green"),
        models.Project(code="PRJ-0005", name="Galvanizing Line Upgrade", company_id=galv.id if galv else None, function_id=ops.id if ops else None, program_id=prog3.id,
                       sponsor_id=U("E001").id if U("E001") else None, manager_id=U("E015").id if U("E015") else None,
                       objective="Upgrade galvanizing line capacity.", project_type="project", priority="high", methodology="agile",
                       start_date=today - timedelta(days=200), baseline_due_date=today + timedelta(days=30),
                       approved_due_date=today + timedelta(days=30), forecast_due_date=today + timedelta(days=55),
                       completion_pct=70.0, status="active", health="red", criticality="high"),
        models.Project(code="PRJ-0006", name="Sales Force Automation", company_id=cement.id if cement else None, function_id=sm.id if sm else None,
                       sponsor_id=U("E002").id if U("E002") else None, manager_id=U("E007").id if U("E007") else None,
                       objective="Automate field sales reporting.", project_type="project", priority="medium", methodology="agile",
                       start_date=today - timedelta(days=30), baseline_due_date=today + timedelta(days=120),
                       approved_due_date=today + timedelta(days=120), completion_pct=40.0, status="active", health="green"),
        models.Project(code="PRJ-0007", name="HR Digital Onboarding", company_id=group.id if group else None, function_id=hr.id if hr else None,
                       sponsor_id=U("E001").id if U("E001") else None, manager_id=U("E014").id if U("E014") else None,
                       objective="Paperless onboarding.", project_type="project", priority="medium", methodology="agile",
                       start_date=today - timedelta(days=15), baseline_due_date=today + timedelta(days=90),
                       approved_due_date=today + timedelta(days=90), completion_pct=15.0, status="planning", health="green"),
    ]
    db.add_all(projects)
    db.flush()

    p_erp = projects[1]
    p_cost = projects[2]
    p_galv = projects[3]
    p_sfa = projects[4]
    p_hr = projects[5]

    # Milestones
    db.add_all([
        models.Milestone(project_id=p_erp.id, name="Requirements Gathering", due_date=today - timedelta(days=20), status="completed", completion_pct=100.0),
        models.Milestone(project_id=p_erp.id, name="Configuration", due_date=today + timedelta(days=60), status="in_progress", completion_pct=40.0),
        models.Milestone(project_id=p_erp.id, name="UAT", due_date=today + timedelta(days=200), status="not_started", completion_pct=0.0),
        models.Milestone(project_id=p_galv.id, name="Mechanical Installation", due_date=today + timedelta(days=10), status="in_progress", completion_pct=80.0),
        models.Milestone(project_id=p_galv.id, name="Commissioning", due_date=today + timedelta(days=30), status="not_started", completion_pct=0.0),
        models.Milestone(project_id=p_sfa.id, name="Pilot Launch", due_date=today + timedelta(days=40), status="not_started", completion_pct=0.0),
    ])
    db.flush()

    # Tasks — a broad spread
    task_defs = [
        # ERP
        dict(project_id=p_erp.id, title="Finalize ERP vendor contract", category="procurement", task_type="task", priority="high",
             responsible_id=U("E013").id, accountable_id=U("E001").id, reviewer_id=U("E004").id,
             baseline_due_date=today - timedelta(days=3), approved_due_date=today - timedelta(days=3),
             progress_pct=80.0, status="in_progress", health="red", blocker=True, blocker_details="Legal review pending"),
        dict(project_id=p_erp.id, title="Map chart of accounts", category="finance", task_type="task", priority="medium",
             responsible_id=U("E012").id, accountable_id=U("E003").id,
             baseline_due_date=today + timedelta(days=15), approved_due_date=today + timedelta(days=15),
             progress_pct=50.0, status="in_progress", health="green"),
        dict(project_id=p_erp.id, title="Data migration scripts", category="technology", task_type="subtask", priority="high",
             responsible_id=U("E013").id, accountable_id=U("E013").id,
             baseline_due_date=today + timedelta(days=45), approved_due_date=today + timedelta(days=45),
             progress_pct=10.0, status="backlog", health="green"),
        dict(project_id=p_erp.id, title="User acceptance test plan", category="compliance", task_type="review", priority="medium",
             responsible_id=U("E012").id, accountable_id=U("E003").id,
             baseline_due_date=today + timedelta(days=120), approved_due_date=today + timedelta(days=120),
             progress_pct=0.0, status="backlog", health="green"),
        # Cost optimization
        dict(project_id=p_cost.id, title="Renegotiate fuel supplier rates", category="procurement", task_type="action", priority="critical",
             responsible_id=U("E002").id, accountable_id=U("E003").id,
             baseline_due_date=today + timedelta(days=2), approved_due_date=today + timedelta(days=2),
             progress_pct=60.0, status="in_progress", health="amber"),
        dict(project_id=p_cost.id, title="Electricity tariff review", category="finance", task_type="task", priority="high",
             responsible_id=U("E012").id, accountable_id=U("E003").id,
             baseline_due_date=today + timedelta(days=10), approved_due_date=today + timedelta(days=10),
             progress_pct=30.0, status="in_progress", health="green"),
        dict(project_id=p_cost.id, title="Manpower optimization study", category="hr", task_type="task", priority="medium",
             responsible_id=U("E014").id, accountable_id=U("E003").id,
             baseline_due_date=today + timedelta(days=25), approved_due_date=today + timedelta(days=25),
             progress_pct=0.0, status="ready", health="green"),
        # Galvanizing
        dict(project_id=p_galv.id, title="Install new zinc bath", category="manufacturing", task_type="task", priority="critical",
             responsible_id=U("E011").id, accountable_id=U("E015").id,
             baseline_due_date=today - timedelta(days=1), approved_due_date=today - timedelta(days=1),
             progress_pct=85.0, status="in_progress", health="red", blocker=True, blocker_details="Imported equipment held at customs"),
        dict(project_id=p_galv.id, title="Commissioning test run", category="manufacturing", task_type="task", priority="high",
             responsible_id=U("E011").id, accountable_id=U("E015").id,
             baseline_due_date=today + timedelta(days=15), approved_due_date=today + timedelta(days=15),
             progress_pct=0.0, status="backlog", health="green"),
        dict(project_id=p_galv.id, title="Safety audit for new line", category="compliance", task_type="approval", priority="high",
             responsible_id=U("E015").id, accountable_id=U("E001").id,
             baseline_due_date=today + timedelta(days=8), approved_due_date=today + timedelta(days=8),
             progress_pct=0.0, status="ready", health="green"),
        # SFA
        dict(project_id=p_sfa.id, title="Build sales dashboard MVP", category="technology", task_type="task", priority="high",
             responsible_id=U("E007").id, accountable_id=U("E002").id,
             baseline_due_date=today + timedelta(days=20), approved_due_date=today + timedelta(days=20),
             progress_pct=45.0, status="in_progress", health="green"),
        dict(project_id=p_sfa.id, title="Onboard pilot dealers", category="sales", task_type="task", priority="medium",
             responsible_id=U("E016").id, accountable_id=U("E007").id,
             baseline_due_date=today + timedelta(days=30), approved_due_date=today + timedelta(days=30),
             progress_pct=0.0, status="backlog", health="green"),
        # HR
        dict(project_id=p_hr.id, title="Digitize offer letter workflow", category="hr", task_type="task", priority="medium",
             responsible_id=U("E014").id, accountable_id=U("E014").id,
             baseline_due_date=today + timedelta(days=14), approved_due_date=today + timedelta(days=14),
             progress_pct=20.0, status="in_progress", health="green"),
        # Standalone / operational
        dict(title="Prepare monthly MIS report", category="finance", task_type="task", priority="high",
             responsible_id=U("E012").id, accountable_id=U("E003").id,
             baseline_due_date=today + timedelta(days=1), approved_due_date=today + timedelta(days=1),
             progress_pct=70.0, status="in_progress", health="amber"),
        dict(title="Supplier payment reconciliation", category="finance", task_type="task", priority="medium",
             responsible_id=U("E012").id, accountable_id=U("E003").id,
             baseline_due_date=today - timedelta(days=2), approved_due_date=today - timedelta(days=2),
             progress_pct=90.0, status="in_review", health="red"),
        dict(title="Renew plant maintenance contracts", category="maintenance", task_type="task", priority="medium",
             responsible_id=U("E011").id, accountable_id=U("E002").id,
             baseline_due_date=today + timedelta(days=5), approved_due_date=today + timedelta(days=5),
             progress_pct=40.0, status="in_progress", health="green"),
        dict(title="Quarterly compliance filing", category="compliance", task_type="compliance_action", priority="high",
             responsible_id=U("E003").id, accountable_id=U("E001").id,
             baseline_due_date=today + timedelta(days=7), approved_due_date=today + timedelta(days=7),
             progress_pct=0.0, status="ready", health="green"),
        dict(title="Customer feedback survey", category="marketing", task_type="task", priority="low",
             responsible_id=U("E016").id, accountable_id=U("E007").id,
             baseline_due_date=today + timedelta(days=21), approved_due_date=today + timedelta(days=21),
             progress_pct=0.0, status="backlog", health="green"),
        dict(title="Server patch and backup", category="technology", task_type="change", priority="medium",
             responsible_id=U("E013").id, accountable_id=U("E013").id,
             baseline_due_date=today - timedelta(days=1), approved_due_date=today - timedelta(days=1),
             progress_pct=100.0, status="completed", actual_due_date=today - timedelta(days=1), health="green"),
        dict(title="Vendor onboarding for IoT", category="procurement", task_type="approval", priority="high",
             responsible_id=U("E013").id, accountable_id=U("E003").id,
             baseline_due_date=today + timedelta(days=3), approved_due_date=today + timedelta(days=3),
             progress_pct=15.0, status="blocked", blocker=True, blocker_details="Awaiting budget approval", health="red"),
    ]
    for td in task_defs:
        db.add(models.Task(code=f"TSK-{9000 + len(task_defs) - task_defs.index(td)}", **td))
    db.flush()

    # RACI entries
    raci_users = [U("E013"), U("E012"), U("E011"), U("E007"), U("E016"), U("E014")]
    for u in raci_users:
        if u:
            db.add(models.RaciEntry(project_id=p_erp.id, user_id=u.id, raci_type="C"))

    # Backlog items
    db.add_all([
        models.BacklogItem(code="BLG-0003", project_id=p_erp.id, requirement="Mobile expense approval", business_value="high", priority="high", status="grooming", requested_by_id=U("E003").id if U("E003") else None),
        models.BacklogItem(code="BLG-0004", project_id=p_erp.id, requirement="BI dashboard for procurement", business_value="medium", priority="medium", status="new", requested_by_id=U("E002").id if U("E002") else None),
        models.BacklogItem(code="BLG-0005", project_id=p_sfa.id, requirement="Geo-fencing for field visits", business_value="high", priority="high", status="prioritized", requested_by_id=U("E007").id if U("E007") else None),
        models.BacklogItem(code="BLG-0006", project_id=p_sfa.id, requirement="Offline order capture", business_value="high", priority="critical", status="ready", requested_by_id=U("E007").id if U("E007") else None),
    ])

    # Meetings + decisions + actions
    m1 = models.Meeting(title="Executive Committee — Mar", meeting_type="executive_committee", meeting_date=today - timedelta(days=10))
    m2 = models.Meeting(title="Business Review — Cement", meeting_type="business_review", meeting_date=today - timedelta(days=5))
    m3 = models.Meeting(title="Project Steering — ERP", meeting_type="steering_committee", meeting_date=today - timedelta(days=3))
    db.add_all([m1, m2, m3])
    db.flush()

    d1 = models.Decision(code="DEC-0002", meeting_id=m1.id, statement="Approve ERP budget of BDT 45M.", owner_id=U("E001").id, decision_date=today - timedelta(days=10), status="closed")
    d2 = models.Decision(code="DEC-0003", meeting_id=m2.id, statement="Fast-track galvanizing line upgrade.", owner_id=U("E002").id, decision_date=today - timedelta(days=5), status="open")
    d3 = models.Decision(code="DEC-0004", meeting_id=m3.id, statement="Extend UAT window by 2 weeks.", owner_id=U("E013").id, project_id=p_erp.id, decision_date=today - timedelta(days=3), status="open")
    db.add_all([d1, d2, d3])
    db.flush()

    db.add_all([
        models.ManagementAction(code="ACT-0002", meeting_id=m1.id, decision_id=d1.id, action="CFO to release ERP budget tranche.", responsible_id=U("E003").id, accountable_id=U("E001").id, due_date=today + timedelta(days=5), status="open"),
        models.ManagementAction(code="ACT-0003", meeting_id=m2.id, decision_id=d2.id, action="Clear customs for imported zinc bath equipment.", responsible_id=U("E015").id, accountable_id=U("E002").id, due_date=today + timedelta(days=2), status="open"),
        models.ManagementAction(code="ACT-0004", meeting_id=m3.id, decision_id=d3.id, action="Update project plan with new UAT dates.", responsible_id=U("E013").id, accountable_id=U("E013").id, due_date=today + timedelta(days=4), status="open"),
    ])

    # Risks + issues
    db.add_all([
        models.Risk(project_id=p_erp.id, description="Key vendor may miss configuration deadline.", category="vendor", likelihood="high", impact="high", mitigation="Assign internal backup resource.", owner_id=U("E013").id, status="open"),
        models.Risk(project_id=p_galv.id, description="Currency fluctuation increases equipment cost.", category="financial", likelihood="medium", impact="medium", mitigation="Hedging via forward contract.", owner_id=U("E015").id, status="open"),
        models.Risk(project_id=p_cost.id, description="Supplier resistance to rate renegotiation.", category="supply_chain", likelihood="medium", impact="high", mitigation="Dual sourcing.", owner_id=U("E002").id, status="open"),
        models.Issue(project_id=p_galv.id, description="Customs clearance delayed for zinc bath.", category="regulatory", severity="high", resolution="Escalated to business head.", owner_id=U("E015").id, status="open"),
        models.Issue(project_id=p_erp.id, description="Data quality issues in legacy master data.", category="data", severity="medium", resolution="Data cleansing workstream initiated.", owner_id=U("E013").id, status="open"),
        models.Issue(project_id=p_sfa.id, description="Pilot dealers lack smartphones.", category="operational", severity="low", resolution=None, owner_id=U("E007").id, status="open"),
    ])

    # Delay RCA records
    db.add_all([
        models.DelayRca(task_id=1, delay_category="approval_pending", delay_reason="Legal review pending on vendor contract.", root_cause="Single legal reviewer overloaded.", recovery_action="Assign second reviewer.", recovery_owner_id=U("E004").id, revised_due_date=today + timedelta(days=5), approval_status="pending"),
        models.DelayRca(task_id=2, delay_category="vendor_delay", delay_reason="Vendor delayed configuration.", root_cause="Vendor resource crunch.", recovery_action="Daily status calls.", recovery_owner_id=U("E013").id, revised_due_date=today + timedelta(days=8), approval_status="approved"),
    ])

    db.commit()
    print("Dummy data loaded successfully.")
    print(f"  Users: {db.query(models.User).count()}")
    print(f"  Projects: {db.query(models.Project).count()}")
    print(f"  Tasks: {db.query(models.Task).count()}")
    print(f"  Milestones: {db.query(models.Milestone).count()}")
    print(f"  Backlog: {db.query(models.BacklogItem).count()}")
    print(f"  Meetings: {db.query(models.Meeting).count()}")
    print(f"  Decisions: {db.query(models.Decision).count()}")
    print(f"  Actions: {db.query(models.ManagementAction).count()}")
    print(f"  Risks: {db.query(models.Risk).count()}")
    print(f"  Issues: {db.query(models.Issue).count()}")
    print(f"  RACI: {db.query(models.RaciEntry).count()}")
    print(f"  Delay RCA: {db.query(models.DelayRca).count()}")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        load(db)
    finally:
        db.close()
