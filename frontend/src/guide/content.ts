import { Chapter, h, info, list, p, steps, t, table, tip, warn } from './types'
import { ADMIN_GUIDE } from './contentAdmin'

// The User Guide's text, English and Bangla side by side (pages/Guide.tsx shows one of them).
// Button and field names are kept in English in both languages, exactly as on the screen,
// so a reader can find them. When a rule of the system changes, change it here too.

const USER_GUIDE: Chapter[] = [
  // ------------------------------------------------------------------ 1. Getting started
  {
    id: 'start', audience: 'all', title: t('1. Getting started', '১. শুরু করা'),
    sections: [
      {
        id: 'what', title: t('What this system is for', 'এই সিস্টেমটি কীসের জন্য'),
        lead: t('One place for every project and task of Anwar Group: who does it, by when, how far it is, and who approved it.',
          'আনোয়ার গ্রুপের সব প্রজেক্ট ও টাস্ক এক জায়গায়: কে করবে, কবে শেষ হবে, কতটুকু হয়েছে এবং কে অনুমোদন করেছে।'),
        blocks: [
          list(
            t('**Plan:** create a project, break it into tasks, give every task an owner and dates.', '**পরিকল্পনা:** প্রজেক্ট তৈরি করুন, টাস্কে ভাগ করুন, প্রতিটি টাস্কে দায়িত্বপ্রাপ্ত ব্যক্তি ও তারিখ দিন।'),
            t('**Do:** update progress, raise blockers, log delays, comment.', '**কাজ:** অগ্রগতি আপডেট করুন, বাধা (Blocker) জানান, বিলম্ব (Delay) লিখুন, মন্তব্য করুন।'),
            t('**Approve:** completion, due-date changes and deletions go through an approval.', '**অনুমোদন:** টাস্ক সম্পন্ন করা, তারিখ পরিবর্তন ও মুছে ফেলা — সবই অনুমোদনের মাধ্যমে হয়।'),
            t('**Measure:** dashboards and the KPI page show how the work is going.', '**পরিমাপ:** ড্যাশবোর্ড ও KPI পেজে কাজের অবস্থা দেখা যায়।'),
          ),
          tip('If you only remember three things: keep your profile complete, update progress on your tasks every week, and use Submit for Completion when a task is done.',
            'শুধু তিনটি বিষয় মনে রাখুন: প্রোফাইল সম্পূর্ণ রাখুন, প্রতি সপ্তাহে টাস্কের অগ্রগতি আপডেট করুন, আর টাস্ক শেষ হলে Submit for Completion ব্যবহার করুন।'),
        ],
      },
      {
        id: 'signup', title: t('Create your account', 'অ্যাকাউন্ট তৈরি করা'),
        lead: t('You either sign up yourself or receive an invitation email.', 'আপনি নিজে Sign Up করতে পারেন, অথবা ইমেইলে আমন্ত্রণ পেতে পারেন।'),
        blocks: [
          h('Sign up yourself', 'নিজে Sign Up করা'),
          steps(
            t('Open the login page and click **Sign Up**.', 'লগইন পেজ খুলে **Sign Up**-এ ক্লিক করুন।'),
            t('Fill in **Employee ID**, **Name**, **Email** and a **Password** (at least 6 characters) - these are required.', '**Employee ID**, **Name**, **Email** ও **Password** (কমপক্ষে ৬ অক্ষর) দিন — এগুলো আবশ্যক।'),
            t('Choose your **SBU**, **Function**, **Department** and **Reports To** (your manager). If your function or department is not in the list, type its name and it is added.', 'আপনার **SBU**, **Function**, **Department** ও **Reports To** (আপনার ম্যানেজার) বেছে নিন। Function বা Department তালিকায় না থাকলে নাম টাইপ করুন — সেটি যোগ হয়ে যাবে।'),
            t('If your manager has no account yet, choose **+ Add new user** and give their email. They get an invitation and you are linked to them.', 'আপনার ম্যানেজারের অ্যাকাউন্ট না থাকলে **+ Add new user** বেছে তাঁর ইমেইল দিন। তিনি আমন্ত্রণ পাবেন এবং আপনি তাঁর সাথে যুক্ত হয়ে যাবেন।'),
            t('Submit. Your account is active at once - go back to the login page and log in.', 'সাবমিট করুন। অ্যাকাউন্ট সাথে সাথে সক্রিয় হয় — লগইন পেজে ফিরে লগইন করুন।'),
          ),
          h('If you were invited', 'আমন্ত্রণ পেয়ে থাকলে'),
          steps(
            t('Open the invitation email and click the link. The Sign Up form opens with your email filled in.', 'আমন্ত্রণের ইমেইল খুলে লিংকে ক্লিক করুন। আপনার ইমেইলসহ Sign Up ফর্ম খুলবে।'),
            t('Complete the form with the **same email** and choose a password. Tasks already assigned to you stay yours.', '**একই ইমেইল** দিয়ে ফর্ম পূরণ করে পাসওয়ার্ড দিন। আগে থেকে আপনাকে দেওয়া টাস্কগুলো আপনারই থাকবে।'),
          ),
          warn('Until you finish Sign Up you cannot log in, even though people can already assign tasks to you.',
            'Sign Up শেষ না করা পর্যন্ত আপনি লগইন করতে পারবেন না, যদিও অন্যরা আপনাকে টাস্ক দিতে পারবেন।'),
          info('A new SBU cannot be created at Sign Up. If yours is missing, sign up without it and ask an admin to assign it.',
            'Sign Up-এর সময় নতুন SBU তৈরি করা যায় না। আপনার SBU না থাকলে সেটি ছাড়াই Sign Up করুন এবং অ্যাডমিনকে যোগ করতে বলুন।'),
        ],
      },
      {
        id: 'login', title: t('Log in and passwords', 'লগইন ও পাসওয়ার্ড'),
        blocks: [
          list(
            t('Log in with your **email or Employee ID** and your password.', '**ইমেইল অথবা Employee ID** ও পাসওয়ার্ড দিয়ে লগইন করুন।'),
            t('You stay logged in for **24 hours**; after that the system asks you to log in again.', 'আপনি **২৪ ঘণ্টা** লগইন থাকবেন; এরপর আবার লগইন করতে হবে।'),
            t('**5 wrong attempts** lock that login for **15 minutes**.', '**৫ বার ভুল** হলে ওই লগইন **১৫ মিনিট** বন্ধ থাকে।'),
            t('Forgot your password: click **Forgot Password**, enter your email, and open the link in the email within **1 hour**.', 'পাসওয়ার্ড ভুলে গেলে: **Forgot Password**-এ ক্লিক করে ইমেইল দিন এবং ইমেইলের লিংকটি **১ ঘণ্টার** মধ্যে খুলুন।'),
            t('To change your password, use **Forgot Password** as well - there is no separate change-password screen.', 'পাসওয়ার্ড পরিবর্তন করতেও **Forgot Password** ব্যবহার করুন — আলাদা কোনো স্ক্রিন নেই।'),
            t('If an admin created your account, you receive an email with a link to set your password (valid 24 hours).', 'অ্যাডমিন আপনার অ্যাকাউন্ট তৈরি করে থাকলে পাসওয়ার্ড সেট করার লিংকসহ ইমেইল পাবেন (২৪ ঘণ্টা কার্যকর)।'),
            t('Sign out with the icon beside your name at the bottom of the menu.', 'মেনুর নিচে আপনার নামের পাশের আইকনে ক্লিক করে Sign out করুন।'),
          ),
          warn('"Wrong email / employee ID or password" also appears when an account has been deactivated. If you are sure of your password, ask an admin.',
            'অ্যাকাউন্ট নিষ্ক্রিয় করা হলেও "Wrong email / employee ID or password" দেখায়। পাসওয়ার্ড ঠিক থাকলে অ্যাডমিনের সাথে যোগাযোগ করুন।'),
        ],
      },
      {
        id: 'profile', title: t('Complete your profile', 'প্রোফাইল সম্পূর্ণ করা'),
        lead: t('Your SBU, function, department and manager decide what is filled in for you and who sees and approves your work.',
          'আপনার SBU, Function, Department ও ম্যানেজারের তথ্য থেকেই ফর্ম স্বয়ংক্রিয়ভাবে পূরণ হয় এবং ঠিক হয় কে আপনার কাজ দেখবেন ও অনুমোদন করবেন।'),
        blocks: [
          steps(
            t('Open **My Dashboard** and click your picture or **✎ Edit my profile**.', '**My Dashboard** খুলে আপনার ছবিতে বা **✎ Edit my profile**-এ ক্লিক করুন।'),
            t('Check **Name**, **Designation**, **SBU**, **Function**, **Department** and **Reports To**.', '**Name**, **Designation**, **SBU**, **Function**, **Department** ও **Reports To** ঠিক আছে কি না দেখুন।'),
            t('Save.', 'Save করুন।'),
          ),
          list(
            t('**Employee ID** and **Email** can only be changed by an admin.', '**Employee ID** ও **Email** শুধু অ্যাডমিন পরিবর্তন করতে পারেন।'),
            t('You can choose an ordinary role yourself. Head roles (COO, Business Head, Functional Head, Department Head) and privileged roles are given only by an admin.', 'সাধারণ রোল আপনি নিজে বেছে নিতে পারেন। হেড রোল (COO, Business Head, Functional Head, Department Head) ও প্রিভিলেজড রোল শুধু অ্যাডমিন দিতে পারেন।'),
            t('If you have a head role, your SBU, Function and Department are locked; ask an admin to change them.', 'আপনার হেড রোল থাকলে SBU, Function ও Department লক থাকে; পরিবর্তনের জন্য অ্যাডমিনকে বলুন।'),
          ),
          tip('Set **Reports To** correctly. When you are made Responsible for a task, your manager is suggested as Accountable, and your manager sees your KPI.',
            '**Reports To** সঠিকভাবে দিন। আপনি কোনো টাস্কের Responsible হলে আপনার ম্যানেজারকে Accountable হিসেবে প্রস্তাব করা হয়, এবং ম্যানেজার আপনার KPI দেখতে পান।'),
        ],
      },
      {
        id: 'menu', title: t('The menu at a glance', 'এক নজরে মেনু'),
        blocks: [
          table(
            [t('Menu', 'মেনু'), t('What you do there', 'সেখানে যা করবেন')],
            [t('My Dashboard', 'My Dashboard'), t('Your tasks and projects, what is due today or overdue, comments, calendar. Start here every day.', 'আপনার টাস্ক ও প্রজেক্ট, আজ কী শেষ করার কথা বা কী দেরি হয়েছে, মন্তব্য, ক্যালেন্ডার। প্রতিদিন এখান থেকেই শুরু করুন।')],
            [t('Tasks (admin only)', 'Tasks (শুধু অ্যাডমিন)'), t('Every task in one list. Everyone else opens tasks from a project or from My Dashboard.', 'সব টাস্ক এক তালিকায়। অন্যরা প্রজেক্ট বা My Dashboard থেকে টাস্ক খোলেন।')],
            [t('Kanban', 'Kanban'), t('Tasks as cards in columns by status; drag a card to change its status.', 'স্ট্যাটাস অনুযায়ী কলামে টাস্কের কার্ড; কার্ড টেনে স্ট্যাটাস বদলান।')],
            [t('Projects', 'Projects'), t('The list of projects; create a project; open one to see its tasks, people, Gantt chart and approvals.', 'প্রজেক্টের তালিকা; নতুন প্রজেক্ট তৈরি; প্রজেক্ট খুলে তার টাস্ক, ব্যক্তি, Gantt চার্ট ও অনুমোদন দেখুন।')],
            [t('Backlog', 'Backlog'), t('Requirements noted before they become tasks.', 'টাস্ক হওয়ার আগে লিখে রাখা চাহিদা (Requirement)।')],
            [t('KPI', 'KPI'), t('Your score, and the score of the people you are allowed to see.', 'আপনার স্কোর এবং যাঁদের দেখার অনুমতি আছে তাঁদের স্কোর।')],
            [t('Actions & Decisions', 'Actions & Decisions'), t('Meetings, the decisions taken and the actions that follow.', 'মিটিং, গৃহীত সিদ্ধান্ত ও তার পরবর্তী করণীয়।')],
            [t('RACI Matrix', 'RACI Matrix'), t('Who is Responsible, Accountable, Consulted (Reviewer) and Informed on each task.', 'প্রতিটি টাস্কে কে Responsible, Accountable, Consulted (Reviewer) ও Informed।')],
            [t('Approvals', 'Approvals'), t('Requests waiting for your decision, and the ones you sent. The red number is how many wait for you.', 'আপনার সিদ্ধান্তের অপেক্ষায় থাকা অনুরোধ এবং আপনার পাঠানো অনুরোধ। লাল সংখ্যাটি দেখায় কয়টি আপনার অপেক্ষায়।')],
            [t('Notifications', 'Notifications'), t('Everything the system told you. The red number is the unread count.', 'সিস্টেম আপনাকে যা জানিয়েছে। লাল সংখ্যাটি অপঠিত বার্তার সংখ্যা।')],
            [t('Audit Trail', 'Audit Trail'), t('The record of who changed what and when.', 'কে, কখন, কী পরিবর্তন করেছেন তার রেকর্ড।')],
            [t('User Guide', 'User Guide'), t('This guide.', 'এই নির্দেশিকা।')],
            [t('Admin Panel (admin only)', 'Admin Panel (শুধু অ্যাডমিন)'), t('Users, roles, hierarchy, email log and duplicates.', 'ইউজার, রোল, হায়ারার্কি, ইমেইল লগ ও ডুপ্লিকেট।')],
          ),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 2. Roles
  {
    id: 'roles', audience: 'all', title: t('2. Roles: who is who', '২. রোল: কে কী'),
    sections: [
      {
        id: 'task-roles', title: t('The four people on a task (RACI)', 'একটি টাস্কের চারজন ব্যক্তি (RACI)'),
        lead: t('Every task names up to four people. Choosing them well is what makes approvals and notifications work.',
          'প্রতিটি টাস্কে সর্বোচ্চ চারজনের নাম থাকে। এঁদের সঠিকভাবে বাছাই করলেই অনুমোদন ও নোটিফিকেশন ঠিকভাবে কাজ করে।'),
        blocks: [
          table(
            [t('Role', 'রোল'), t('Who it is', 'কে'), t('What they do in the system', 'সিস্টেমে যা করেন')],
            [t('**Responsible (R)**', '**Responsible (R)**'), t('The person who does the work.', 'যিনি কাজটি করেন।'), t('Updates progress, submits for completion, requests date revisions; can edit the task and choose its Accountable, Reviewer and Informed.', 'অগ্রগতি আপডেট করেন, Submit for Completion করেন, তারিখ পরিবর্তনের অনুরোধ করেন; টাস্ক এডিট করতে এবং Accountable, Reviewer ও Informed ঠিক করতে পারেন।')],
            [t('**Accountable (A)**', '**Accountable (A)**'), t('The person who answers for the result - usually the Responsible person\'s manager.', 'ফলাফলের জন্য যিনি জবাবদিহি করেন — সাধারণত Responsible ব্যক্তির ম্যানেজার।'), t('Can update progress and edit the task details; approves completion when there is no Reviewer.', 'অগ্রগতি আপডেট ও টাস্কের বিবরণ এডিট করতে পারেন; Reviewer না থাকলে সম্পন্ন করার অনুমোদন দেন।')],
            [t('**Reviewer (C)**', '**Reviewer (C)**'), t('The person who checks the work.', 'যিনি কাজটি যাচাই করেন।'), t('Approves completion and due-date revisions. Cannot edit the task.', 'সম্পন্ন করা ও তারিখ পরিবর্তনের অনুমোদন দেন। টাস্ক এডিট করতে পারেন না।')],
            [t('**Informed (I)**', '**Informed (I)**'), t('Someone who must be kept up to date.', 'যাঁকে হালনাগাদ জানাতে হবে।'), t('Sees the task and is notified of status and progress changes. Never edits or approves.', 'টাস্ক দেখতে পান এবং স্ট্যাটাস ও অগ্রগতির পরিবর্তন জানতে পারেন। এডিট বা অনুমোদন করেন না।')],
          ),
          warn('Do not make the same person Responsible, Accountable and Reviewer. Nobody can approve their own request, so the approval then goes to the requester\'s line manager - or to no one.',
            'একই ব্যক্তিকে Responsible, Accountable ও Reviewer করবেন না। কেউ নিজের অনুরোধ নিজে অনুমোদন করতে পারেন না; তখন অনুমোদন যায় অনুরোধকারীর লাইন ম্যানেজারের কাছে — অথবা কারও কাছেই যায় না।'),
          tip('A task without a Reviewer cannot have its due date revised. Always give a Reviewer.',
            'Reviewer না থাকলে টাস্কের তারিখ পরিবর্তনের অনুরোধ করা যায় না। সবসময় Reviewer দিন।'),
        ],
      },
      {
        id: 'project-roles', title: t('People on a project', 'প্রজেক্টের ব্যক্তিবর্গ'),
        blocks: [
          table(
            [t('Role', 'রোল'), t('How they get it', 'কীভাবে পান'), t('What they can do', 'যা করতে পারেন')],
            [t('**Project Manager**', '**Project Manager**'), t('Chosen when the project is created (required).', 'প্রজেক্ট তৈরির সময় বেছে নেওয়া হয় (আবশ্যক)।'), t('Changes any task\'s dates directly, decides task deletions, sets the methodology document and its approvers, adds associated people, deletes the project, receives project comments.', 'যেকোনো টাস্কের তারিখ সরাসরি বদলান, টাস্ক মুছে ফেলার সিদ্ধান্ত নেন, Methodology ডকুমেন্ট ও অনুমোদনকারী ঠিক করেন, সংশ্লিষ্ট ব্যক্তি যোগ করেন, প্রজেক্ট মুছতে পারেন, প্রজেক্টের মন্তব্য পান।')],
            [t('**Owner**', '**Owner**'), t('Automatically the person who created the project.', 'যিনি প্রজেক্ট তৈরি করেছেন তিনি স্বয়ংক্রিয়ভাবে Owner।'), t('Sees the whole project, adds associated people, switches the Gantt chart, schedules meetings.', 'পুরো প্রজেক্ট দেখেন, সংশ্লিষ্ট ব্যক্তি যোগ করেন, Gantt চার্ট চালু/বন্ধ করেন, মিটিং ডাকেন।')],
            [t('**People on its tasks**', '**টাস্কের ব্যক্তিরা**'), t('Responsible / Accountable / Reviewer / Informed on any task of the project.', 'প্রজেক্টের যেকোনো টাস্কের Responsible / Accountable / Reviewer / Informed।'), t('See the project and all its tasks. Responsible and Accountable people can also edit the project.', 'প্রজেক্ট ও তার সব টাস্ক দেখেন। Responsible ও Accountable ব্যক্তিরা প্রজেক্ট এডিটও করতে পারেন।')],
            [t('**Associated people**', '**Associated people**'), t('Added on the project page with a note of their contribution.', 'প্রজেক্ট পেজে তাঁদের অবদানের বিবরণসহ যোগ করা হয়।'), t('See the project and all its tasks. No edit rights from this alone.', 'প্রজেক্ট ও তার সব টাস্ক দেখেন। শুধু এর কারণে এডিটের অধিকার পান না।')],
          ),
        ],
      },
      {
        id: 'system-roles', title: t('System roles and what each one sees', 'সিস্টেম রোল এবং কে কী দেখেন'),
        blocks: [
          table(
            [t('Role', 'রোল'), t('Sees', 'দেখতে পান'), t('Extra rights', 'অতিরিক্ত অধিকার')],
            [t('Employee, Team Lead, PM and other ordinary roles', 'Employee, Team Lead, PM ও অন্যান্য সাধারণ রোল'), t('The projects they are on (with all their tasks) and the single tasks they are named on.', 'যে প্রজেক্টে তাঁরা আছেন (সব টাস্কসহ) এবং যে টাস্কে তাঁদের নাম আছে।'), t('None beyond their task and project roles.', 'টাস্ক ও প্রজেক্ট রোলের বাইরে কিছু নেই।')],
            [t('Department Head', 'Department Head'), t('Every task of their SBU + Department, and the projects those tasks belong to.', 'তাঁর SBU + Department-এর সব টাস্ক এবং সেই টাস্কগুলোর প্রজেক্ট।'), t('Sees the KPI of the people of that department.', 'ওই ডিপার্টমেন্টের সবার KPI দেখেন।')],
            [t('Functional Head', 'Functional Head'), t('Every project and task of their SBU + Function.', 'তাঁর SBU + Function-এর সব প্রজেক্ট ও টাস্ক।'), t('Sees the KPI of the people of that function.', 'ওই ফাংশনের সবার KPI দেখেন।')],
            [t('Business Head (SBU head)', 'Business Head (SBU প্রধান)'), t('Every project and task of their SBU.', 'তাঁর SBU-এর সব প্রজেক্ট ও টাস্ক।'), t('Sees the KPI of everyone in the SBU.', 'SBU-এর সবার KPI দেখেন।')],
            [t('COO', 'COO'), t('Every project and task of the SBUs they oversee.', 'তাঁর তত্ত্বাবধানে থাকা SBU-গুলোর সব প্রজেক্ট ও টাস্ক।'), t('In those SBUs: edits every task and project, decides approvals, completes tasks directly.', 'ওই SBU-গুলোতে: সব টাস্ক ও প্রজেক্ট এডিট করেন, অনুমোদনের সিদ্ধান্ত নেন, সরাসরি টাস্ক সম্পন্ন করতে পারেন।')],
            [t('Privileged roles (set by the admin, e.g. Group Executive, PMO)', 'প্রিভিলেজড রোল (অ্যাডমিন ঠিক করেন, যেমন Group Executive, PMO)'), t('Everything.', 'সবকিছু।'), t('Edit every task and project, complete tasks directly, see everyone\'s KPI.', 'সব টাস্ক ও প্রজেক্ট এডিট করেন, সরাসরি টাস্ক সম্পন্ন করতে পারেন, সবার KPI দেখেন।')],
            [t('Admin', 'Admin'), t('Everything.', 'সবকিছু।'), t('All of the above, plus the Admin Panel, the Tasks page, deciding any approval and permanent deletes.', 'উপরের সবকিছু, সাথে Admin Panel, Tasks পেজ, যেকোনো অনুমোদনের সিদ্ধান্ত এবং স্থায়ীভাবে মুছে ফেলা।')],
          ),
          info('Everyone also sees the people who report to them on the KPI page, whatever their role.',
            'রোল যাই হোক, KPI পেজে প্রত্যেকে তাঁর অধীনস্থদের দেখতে পান।'),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 3. Projects
  {
    id: 'projects', audience: 'all', title: t('3. Projects', '৩. প্রজেক্ট'),
    sections: [
      {
        id: 'project-create', title: t('Create a project', 'প্রজেক্ট তৈরি করা'),
        lead: t('Anyone can create a project. You can add its tasks in the same form.', 'যে কেউ প্রজেক্ট তৈরি করতে পারেন। একই ফর্মে টাস্কও যোগ করা যায়।'),
        blocks: [
          steps(
            t('Open **Projects** and click **+ Add Project**.', '**Projects** খুলে **+ Add Project**-এ ক্লিক করুন।'),
            t('Fill in the required fields: **Project Name**, **SBU** (one or more), **Project Manager**, **Start Date** and **Due Date**. The project code (PRJ-0001…) is given automatically.', 'আবশ্যক ঘরগুলো পূরণ করুন: **Project Name**, **SBU** (এক বা একাধিক), **Project Manager**, **Start Date** ও **Due Date**। প্রজেক্ট কোড (PRJ-0001…) স্বয়ংক্রিয়ভাবে আসে।'),
            t('Choose **Type**, **Methodology**, **Priority** and **Status** (they have defaults: operational, hybrid, medium, planning).', '**Type**, **Methodology**, **Priority** ও **Status** বেছে নিন (ডিফল্ট: operational, hybrid, medium, planning)।'),
            t('Write the **Objective** and **Expected Outcome** so everyone understands why the project exists.', '**Objective** ও **Expected Outcome** লিখুন, যাতে সবাই বোঝেন প্রজেক্টটি কেন।'),
            t('Click **+ Add Task** for each task. Set the shared **Function**, **Department**, **Category** and **Status** once, then for each task: **Task Title**, **Responsible**, **Accountable**, **Reviewer** (required), and **Informed**, **Planned Start**, **Due Date**, **Priority**, **Description**, **Expected Deliverable**.', 'প্রতিটি টাস্কের জন্য **+ Add Task**-এ ক্লিক করুন। সবার জন্য একবার **Function**, **Department**, **Category** ও **Status** দিন, তারপর প্রতিটি টাস্কে: **Task Title**, **Responsible**, **Accountable**, **Reviewer** (আবশ্যক), এবং **Informed**, **Planned Start**, **Due Date**, **Priority**, **Description**, **Expected Deliverable**।'),
            t('Click **Create Project + N Tasks**.', '**Create Project + N Tasks**-এ ক্লিক করুন।'),
          ),
          list(
            t('The start date cannot be after the due date.', 'Start Date, Due Date-এর পরে হতে পারে না।'),
            t('A task left without dates takes the project\'s dates, and every task gets the project\'s SBUs.', 'তারিখ না দিলে টাস্ক প্রজেক্টের তারিখ নেয়, এবং প্রতিটি টাস্ক প্রজেক্টের SBU পায়।'),
            t('Accountable is suggested from the Responsible person\'s manager; Accountable, Reviewer and Informed are copied from the task above to save typing.', 'Responsible ব্যক্তির ম্যানেজারকে Accountable হিসেবে প্রস্তাব করা হয়; টাইপ কমাতে Accountable, Reviewer ও Informed উপরের টাস্ক থেকে কপি হয়।'),
            t('If a person is not in the list, choose **+ new user**, enter their email and they are invited and selected.', 'কেউ তালিকায় না থাকলে **+ new user** বেছে তাঁর ইমেইল দিন — তাঁকে আমন্ত্রণ পাঠানো হবে এবং তিনি নির্বাচিত হবেন।'),
            t('If some tasks fail to save, the project is kept and the button changes to **Retry N Tasks**.', 'কিছু টাস্ক সেভ না হলে প্রজেক্ট থেকে যায় এবং বাটনটি **Retry N Tasks** হয়ে যায়।'),
          ),
          tip('Give realistic dates. The KPI compares each task\'s progress with where its dates say it should be today.',
            'বাস্তবসম্মত তারিখ দিন। KPI প্রতিটি টাস্কের অগ্রগতিকে তুলনা করে — তারিখ অনুযায়ী আজ তা কোথায় থাকার কথা।'),
        ],
      },
      {
        id: 'sdlc', title: t('Development project: tasks by SDLC', 'ডেভেলপমেন্ট প্রজেক্ট: SDLC অনুযায়ী টাস্ক'),
        lead: t('For a software or system development project, create the tasks phase by phase. The system has no ready-made template, so add them yourself with **+ Add Task** using the list below.',
          'সফটওয়্যার বা সিস্টেম ডেভেলপমেন্ট প্রজেক্টের টাস্কগুলো ধাপ অনুযায়ী তৈরি করুন। সিস্টেমে তৈরি টেমপ্লেট নেই, তাই নিচের তালিকা দেখে **+ Add Task** দিয়ে নিজে যোগ করুন।'),
        blocks: [
          table(
            [t('SDLC phase', 'SDLC ধাপ'), t('Tasks to create', 'যে টাস্কগুলো তৈরি করবেন'), t('Expected Deliverable', 'Expected Deliverable')],
            [t('**1. Planning**', '**১. পরিকল্পনা (Planning)**'), t('Project charter and scope; feasibility study; resource and timeline plan; risk list', 'প্রজেক্ট চার্টার ও পরিধি; সম্ভাব্যতা যাচাই; জনবল ও সময় পরিকল্পনা; ঝুঁকির তালিকা'), t('Approved charter, project plan', 'অনুমোদিত চার্টার, প্রজেক্ট প্ল্যান')],
            [t('**2. Requirement analysis**', '**২. চাহিদা বিশ্লেষণ (Requirement)**'), t('Gather requirements from users; write the BRD / SRS; get user sign-off', 'ব্যবহারকারীর কাছ থেকে চাহিদা সংগ্রহ; BRD / SRS লেখা; ব্যবহারকারীর সম্মতি নেওয়া'), t('Signed-off BRD / SRS', 'স্বাক্ষরিত BRD / SRS')],
            [t('**3. Design**', '**৩. ডিজাইন (Design)**'), t('System architecture; database design; UI / UX design; design review', 'সিস্টেম আর্কিটেকচার; ডেটাবেজ ডিজাইন; UI / UX ডিজাইন; ডিজাইন রিভিউ'), t('Design document, approved screens', 'ডিজাইন ডকুমেন্ট, অনুমোদিত স্ক্রিন')],
            [t('**4. Development**', '**৪. ডেভেলপমেন্ট (Development)**'), t('One task per module or feature; code review; integration', 'প্রতিটি মডিউল বা ফিচারের জন্য আলাদা টাস্ক; কোড রিভিউ; ইন্টিগ্রেশন'), t('Working module, reviewed code', 'কার্যকর মডিউল, রিভিউ করা কোড')],
            [t('**5. Testing**', '**৫. টেস্টিং (Testing)**'), t('Test plan and test cases; system testing; bug fixing; UAT with users', 'টেস্ট প্ল্যান ও টেস্ট কেস; সিস্টেম টেস্টিং; বাগ সংশোধন; ব্যবহারকারীর সাথে UAT'), t('Test report, UAT sign-off', 'টেস্ট রিপোর্ট, UAT সম্মতি')],
            [t('**6. Deployment**', '**৬. ডিপ্লয়মেন্ট (Deployment)**'), t('Server and environment setup; data migration; go-live; user training', 'সার্ভার ও এনভায়রনমেন্ট প্রস্তুত; ডেটা মাইগ্রেশন; গো-লাইভ; ব্যবহারকারী প্রশিক্ষণ'), t('Live system, training record', 'চালু সিস্টেম, প্রশিক্ষণের রেকর্ড')],
            [t('**7. Maintenance**', '**৭. রক্ষণাবেক্ষণ (Maintenance)**'), t('Post-go-live support; issue fixing; enhancements; project closure report', 'চালুর পরের সাপোর্ট; সমস্যা সমাধান; উন্নয়ন; প্রজেক্ট সমাপ্তি রিপোর্ট'), t('Support log, closure report', 'সাপোর্ট লগ, সমাপ্তি রিপোর্ট')],
          ),
          h('How to enter them well', 'কীভাবে ভালোভাবে লিখবেন'),
          list(
            t('Start each task title with the phase, for example **"Design - Database design"**, so the task list reads in order.', 'প্রতিটি টাস্কের শিরোনাম ধাপের নাম দিয়ে শুরু করুন, যেমন **"Design - Database design"**, যাতে তালিকা ক্রমানুসারে পড়া যায়।'),
            t('Give each phase its own dates inside the project\'s start and due dates, one after another.', 'প্রজেক্টের শুরু ও শেষের তারিখের ভেতরে প্রতিটি ধাপকে একটির পর একটি আলাদা তারিখ দিন।'),
            t('Responsible = the person doing it (analyst, designer, developer, tester). Accountable = their lead. Reviewer = the person who signs off that phase (for example the Project Manager or the business user).', 'Responsible = যিনি কাজটি করবেন (অ্যানালিস্ট, ডিজাইনার, ডেভেলপার, টেস্টার)। Accountable = তাঁর লিড। Reviewer = যিনি ওই ধাপ অনুমোদন করবেন (যেমন Project Manager বা ব্যবসায়িক ব্যবহারকারী)।'),
            t('Write the **Expected Deliverable** for every task - the Reviewer approves completion against it.', 'প্রতিটি টাস্কে **Expected Deliverable** লিখুন — Reviewer এটি দেখেই সম্পন্ন করার অনুমোদন দেন।'),
            t('Use **Task Type** to tell the kinds apart: task, review, approval, bug, change.', 'ধরন আলাদা করতে **Task Type** ব্যবহার করুন: task, review, approval, bug, change।'),
            t('Choose the **Methodology** that fits: **waterfall** when phases follow strictly one after another, **agile** when you deliver in short cycles, **hybrid** for a mix.', 'উপযুক্ত **Methodology** বাছুন: ধাপগুলো কঠোরভাবে একটির পর একটি হলে **waterfall**, ছোট ছোট চক্রে ডেলিভারি হলে **agile**, মিশ্র হলে **hybrid**।'),
            t('Turn on the **Gantt chart** and make each phase depend on the one before it, so a delay in Design automatically shows its effect on Development and the go-live date.', '**Gantt চার্ট** চালু করে প্রতিটি ধাপকে আগের ধাপের উপর নির্ভরশীল করুন, যাতে Design-এ দেরি হলে Development ও গো-লাইভের তারিখে তার প্রভাব স্বয়ংক্রিয়ভাবে দেখা যায়।'),
            t('Bugs found in testing: add each important one as a task with Task Type **bug**.', 'টেস্টিং-এ পাওয়া বাগ: গুরুত্বপূর্ণ প্রতিটি বাগ Task Type **bug** দিয়ে আলাদা টাস্ক হিসেবে যোগ করুন।'),
          ),
          tip('Attach the methodology document (a Google Drive link) under **Methodology Approval** on the project page so the plan is approved before development starts.',
            'ডেভেলপমেন্ট শুরুর আগে পরিকল্পনা অনুমোদন করাতে প্রজেক্ট পেজের **Methodology Approval**-এ Methodology ডকুমেন্ট (Google Drive লিংক) যুক্ত করুন।'),
        ],
      },
      {
        id: 'project-page', title: t('The project page', 'প্রজেক্ট পেজ'),
        lead: t('Click a project in the Projects list to open it.', 'Projects তালিকা থেকে প্রজেক্টে ক্লিক করলে এটি খোলে।'),
        blocks: [
          table(
            [t('Section', 'অংশ'), t('What it shows', 'যা দেখায়')],
            [t('Header', 'শিরোনাম'), t('Name, code, SBU, status and health; **☰ All Tasks**, **✎ Edit Project**, **Delete Project**.', 'নাম, কোড, SBU, স্ট্যাটাস ও হেলথ; **☰ All Tasks**, **✎ Edit Project**, **Delete Project**।')],
            [t('Number cards', 'সংখ্যার কার্ড'), t('Completion %, tasks done, open tasks, overdue, people, due date.', 'সম্পন্নের হার, শেষ হওয়া টাস্ক, চলমান টাস্ক, মেয়াদোত্তীর্ণ, ব্যক্তি, শেষ তারিখ।')],
            [t('Overview', 'Overview'), t('Objective, expected outcome, type, methodology, priority.', 'উদ্দেশ্য, প্রত্যাশিত ফলাফল, ধরন, মেথডলজি, অগ্রাধিকার।')],
            [t('Methodology Approval', 'Methodology Approval'), t('The methodology document and its three approvers.', 'Methodology ডকুমেন্ট ও তিনজন অনুমোদনকারী।')],
            [t('Deadline Governance', 'Deadline Governance'), t('Start, baseline due, approved due, forecast and actual completion dates.', 'শুরু, বেসলাইন, অনুমোদিত, পূর্বাভাস ও প্রকৃত সমাপ্তির তারিখ।')],
            [t('RACI', 'RACI'), t('How many tasks each person has as R, A, C and I, and gaps.', 'প্রত্যেকের কতটি টাস্ক R, A, C ও I হিসেবে আছে, এবং কোথায় ঘাটতি।')],
            [t('Contributors & Associates', 'Contributors & Associates'), t('The Project Manager, each person\'s share of tasks, and associated people.', 'Project Manager, প্রত্যেকের টাস্কের ভাগ এবং সংশ্লিষ্ট ব্যক্তিরা।')],
            [t('Tasks', 'Tasks'), t('The project\'s tasks, a filter by employee, and **+ New Task**.', 'প্রজেক্টের টাস্ক, কর্মী অনুযায়ী ফিল্টার এবং **+ New Task**।')],
            [t('Gantt Chart', 'Gantt Chart'), t('The timeline, dependencies and schedule impact (optional).', 'সময়রেখা, নির্ভরশীলতা ও সময়সূচির প্রভাব (ঐচ্ছিক)।')],
            [t('Comments', 'Comments'), t('Messages to the Project Manager about the project.', 'প্রজেক্ট নিয়ে Project Manager-কে বার্তা।')],
          ),
          list(
            t('**Health** is calculated, not typed: a project is as red as its worst task. A task is red when it is blocked or overdue, amber when a delay has been logged or it is due within a day and at least half done.', '**Health** হিসাব করে আসে, টাইপ করা হয় না: প্রজেক্টের রং তার সবচেয়ে খারাপ টাস্কের মতো। টাস্ক লাল হয় Blocker থাকলে বা মেয়াদ পার হলে; হলুদ (amber) হয় Delay লেখা হলে বা এক দিনের মধ্যে মেয়াদ এবং অন্তত অর্ধেক সম্পন্ন হলে।'),
            t('**Completion %** is the average progress of the project\'s tasks.', '**Completion %** হলো প্রজেক্টের টাস্কগুলোর গড় অগ্রগতি।'),
            t('**Status** is set by hand in Edit Project. Setting it to completed or closed stamps today as the actual completion date.', '**Status** হাতে দেওয়া হয় (Edit Project থেকে)। completed বা closed করলে আজকের তারিখ প্রকৃত সমাপ্তির তারিখ হিসেবে বসে।'),
          ),
          warn('Deleting a project permanently deletes all its tasks with their history, approvals and RACI. Only the Project Manager (on the project page) or an admin (in the Projects list) can do it. It cannot be undone.',
            'প্রজেক্ট মুছলে তার সব টাস্ক, ইতিহাস, অনুমোদন ও RACI স্থায়ীভাবে মুছে যায়। শুধু Project Manager (প্রজেক্ট পেজে) বা অ্যাডমিন (Projects তালিকায়) এটি করতে পারেন। এটি ফেরানো যায় না।'),
        ],
      },
      {
        id: 'methodology', title: t('Methodology approval', 'Methodology অনুমোদন'),
        lead: t('A project\'s plan or methodology document, approved by three people before the work goes ahead.', 'প্রজেক্টের পরিকল্পনা বা Methodology ডকুমেন্ট, যা কাজ এগোনোর আগে তিনজন অনুমোদন করেন।'),
        blocks: [
          steps(
            t('The **Project Manager** opens the project page and, under **Methodology Approval**, clicks **+ Add document link**.', '**Project Manager** প্রজেক্ট পেজে **Methodology Approval**-এর নিচে **+ Add document link**-এ ক্লিক করেন।'),
            t('Paste a **Google Drive / Google Docs share link** and share that file with the approvers in Google Drive.', '**Google Drive / Google Docs-এর শেয়ার লিংক** পেস্ট করুন এবং Google Drive-এ ফাইলটি অনুমোদনকারীদের সাথে শেয়ার করুন।'),
            t('Assign the three approvers with **+ Assign**: **Group Executive**, **Team Lead** and **Function Head**.', '**+ Assign** দিয়ে তিনজন অনুমোদনকারী ঠিক করুন: **Group Executive**, **Team Lead** ও **Function Head**।'),
            t('Each approver opens the document and chooses **Approve**, **Under Review** or **Reject**. A note is required for Under Review and Reject.', 'প্রত্যেক অনুমোদনকারী ডকুমেন্ট খুলে **Approve**, **Under Review** বা **Reject** বেছে নেন। Under Review ও Reject-এর জন্য নোট আবশ্যক।'),
            t('The Project Manager is notified and emailed after every decision.', 'প্রতিটি সিদ্ধান্তের পর Project Manager নোটিফিকেশন ও ইমেইল পান।'),
          ),
          table(
            [t('Badge', 'ব্যাজ'), t('Meaning', 'অর্থ')],
            [t('Awaiting document', 'Awaiting document'), t('No link has been added yet.', 'এখনো কোনো লিংক যোগ করা হয়নি।')],
            [t('Pending approval', 'Pending approval'), t('Waiting for one or more approvers.', 'এক বা একাধিক অনুমোদনকারীর অপেক্ষায়।')],
            [t('Changes requested', 'Changes requested'), t('An approver chose Under Review.', 'কোনো অনুমোদনকারী Under Review দিয়েছেন।')],
            [t('Rejected', 'Rejected'), t('An approver rejected it.', 'কোনো অনুমোদনকারী প্রত্যাখ্যান করেছেন।')],
            [t('Approved', 'Approved'), t('All three approved.', 'তিনজনই অনুমোদন করেছেন।')],
          ),
          list(
            t('Only the assigned approver can decide their own slot - not even an admin can decide for them.', 'শুধু নির্ধারিত অনুমোদনকারী নিজের অংশের সিদ্ধান্ত দিতে পারেন — অ্যাডমিনও তাঁর হয়ে পারেন না।'),
            t('Changing the link sets every decision back to Pending and notifies the approvers again.', 'লিংক পরিবর্তন করলে সব সিদ্ধান্ত আবার Pending হয় এবং অনুমোদনকারীদের আবার জানানো হয়।'),
            t('This approval is a record; it does not lock the project or change its status.', 'এই অনুমোদন একটি রেকর্ড; এটি প্রজেক্ট লক করে না বা স্ট্যাটাস বদলায় না।'),
          ),
        ],
      },
      {
        id: 'gantt', title: t('Gantt chart and dependencies', 'Gantt চার্ট ও নির্ভরশীলতা'),
        blocks: [
          steps(
            t('On the project page, switch **Gantt Chart** on (the Project Manager, Owner, a task\'s Responsible / Accountable, or admin / PMO).', 'প্রজেক্ট পেজে **Gantt Chart** চালু করুন (Project Manager, Owner, টাস্কের Responsible / Accountable, অথবা admin / PMO)।'),
            t('Click **⛓ Set dependencies**, choose a task, then under **Depends on** choose the tasks that must finish first.', '**⛓ Set dependencies**-এ ক্লিক করে একটি টাস্ক বাছুন, তারপর **Depends on**-এ সেই টাস্কগুলো বাছুন যেগুলো আগে শেষ হতে হবে।'),
            t('Read **Schedule Impact**: it lists the late tasks and whether each one pushes the whole project.', '**Schedule Impact** দেখুন: এখানে দেরি হওয়া টাস্ক এবং সেগুলো পুরো প্রজেক্টকে পিছিয়ে দিচ্ছে কি না দেখায়।'),
          ),
          list(
            t('A task that has not started begins the day after the tasks it depends on finish. A task already in progress is not moved.', 'শুরু না হওয়া টাস্ক তার নির্ভরশীল টাস্কগুলো শেষ হওয়ার পরদিন শুরু হয়। চলমান টাস্ক সরানো হয় না।'),
            t('Only the **Forecast** date changes automatically. Planned, baseline and approved dates are never touched.', 'শুধু **Forecast** তারিখ স্বয়ংক্রিয়ভাবে বদলায়। Planned, baseline ও approved তারিখ কখনো বদলায় না।'),
            t('**Critical** tasks are the chain with no spare day that decides the project\'s last finish date.', '**Critical** টাস্ক হলো সেই ধারাবাহিক টাস্কগুলো যাদের কোনো বাড়তি দিন নেই এবং যারা প্রজেক্টের শেষ তারিখ নির্ধারণ করে।'),
            t('Switching the chart off deletes nothing.', 'চার্ট বন্ধ করলে কিছুই মুছে যায় না।'),
          ),
          h('Subtasks (optional)', 'সাবটাস্ক (ঐচ্ছিক)'),
          p('A task can be broken into subtasks on the chart. Use them only where they help; a task without subtasks works exactly as before.',
            'চার্টে একটি টাস্ককে সাবটাস্কে ভাগ করা যায়। যেখানে দরকার শুধু সেখানেই ব্যবহার করুন; সাবটাস্ক ছাড়া টাস্ক আগের মতোই কাজ করে।'),
          steps(
            t('On the task\'s row in the chart click **＋**.', 'চার্টে টাস্কের সারিতে **＋**-এ ক্লিক করুন।'),
            t('Give a **Subtask Title** (required), and if you wish a **Description**, the **Expected Deliverable** and the **Progress %**. Nothing else is asked: the project, people and dates are taken from the task.', '**Subtask Title** দিন (আবশ্যক), এবং চাইলে **Description**, **Expected Deliverable** ও **Progress %**। আর কিছু চাওয়া হয় না: প্রজেক্ট, ব্যক্তি ও তারিখ টাস্ক থেকেই নেওয়া হয়।'),
            t('Click **▸** on the task to open its subtasks and **▾** to close them. Each one is drawn as a thin bar under the task, with its progress.', 'সাবটাস্ক খুলতে টাস্কের **▸**-এ এবং বন্ধ করতে **▾**-এ ক্লিক করুন। প্রতিটি সাবটাস্ক টাস্কের নিচে অগ্রগতিসহ একটি চিকন বার হিসেবে দেখায়।'),
            t('Click a subtask to change its progress or text, or to delete it.', 'অগ্রগতি বা লেখা বদলাতে, অথবা মুছতে সাবটাস্কে ক্লিক করুন।'),
          ),
          list(
            t('Who can add or change subtasks: the task\'s Responsible and Accountable, the Project Manager, admin / privileged roles and the SBU\'s COO. Everyone who sees the task sees its subtasks.', 'কে সাবটাস্ক যোগ বা পরিবর্তন করতে পারেন: টাস্কের Responsible ও Accountable, Project Manager, অ্যাডমিন / প্রিভিলেজড রোল এবং SBU-এর COO। যাঁরা টাস্ক দেখেন তাঁরা সবাই সাবটাস্ক দেখেন।'),
            t('A subtask needs no approval and is not counted in the KPI. It does not change the task\'s own progress - the chart shows the average of the subtasks beside it, and you still update the task\'s progress yourself.', 'সাবটাস্কের অনুমোদন লাগে না এবং এটি KPI-তে গণনা হয় না। এটি টাস্কের নিজের অগ্রগতি বদলায় না — চার্টে পাশে সাবটাস্কগুলোর গড় দেখায়, আর টাস্কের অগ্রগতি আপনাকেই আপডেট করতে হয়।'),
            t('A task that has subtasks also shows them on its own page, in a **Subtasks** card on the right, under Delay / RCA: each one with its progress, and how many are done. Click one there to update it, or use **+ Add Subtask**.', 'যে টাস্কের সাবটাস্ক আছে, তার নিজের পেজেও ডান পাশে Delay / RCA-এর নিচে **Subtasks** কার্ডে সেগুলো দেখায়: প্রতিটির অগ্রগতি এবং কয়টি শেষ হয়েছে। সেখানে কোনোটিতে ক্লিক করে আপডেট করুন, অথবা **+ Add Subtask** ব্যবহার করুন।'),
            t('Deleting a task deletes its subtasks.', 'টাস্ক মুছলে তার সাবটাস্কও মুছে যায়।'),
          ),
        ],
      },
      {
        id: 'project-find', title: t('Find a project', 'প্রজেক্ট খোঁজা'),
        blocks: [
          p('On **Projects**, use the filters above the list. They combine, and **Clear** resets them.', '**Projects** পেজে তালিকার উপরের ফিল্টার ব্যবহার করুন। ফিল্টারগুলো একসাথে কাজ করে, আর **Clear** সব মুছে দেয়।'),
          table(
            [t('Filter', 'ফিল্টার'), t('Finds', 'যা খুঁজে দেয়')],
            [t('Project Name', 'Project Name'), t('Projects whose name or code contains what you type.', 'যে প্রজেক্টের নাম বা কোডে আপনার লেখা শব্দ আছে।')],
            [t('SBU', 'SBU'), t('Projects of that SBU, or with a task in it.', 'ওই SBU-এর প্রজেক্ট, অথবা যার কোনো টাস্ক ওই SBU-তে আছে।')],
            [t('Function', 'Function'), t('Projects of that function, or with a task in it.', 'ওই Function-এর প্রজেক্ট, অথবা যার কোনো টাস্ক সেখানে আছে।')],
            [t('Department', 'Department'), t('Projects that have at least one task in that department.', 'যে প্রজেক্টের অন্তত একটি টাস্ক ওই Department-এ আছে।')],
            [t('Status, Health, Type, Methodology', 'Status, Health, Type, Methodology'), t('Projects with that value.', 'ওই মানের প্রজেক্ট।')],
            [t('Employee', 'Employee'), t('Projects that person manages or has a task on; their tasks are listed below.', 'ওই ব্যক্তি যে প্রজেক্ট পরিচালনা করেন বা যাতে তাঁর টাস্ক আছে; নিচে তাঁর টাস্কগুলো দেখায়।')],
          ),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 4. Tasks
  {
    id: 'tasks', audience: 'all', title: t('4. Tasks', '৪. টাস্ক'),
    sections: [
      {
        id: 'task-create', title: t('Create a task', 'টাস্ক তৈরি করা'),
        blocks: [
          steps(
            t('Open the project and click **+ New Task** in its Tasks section (admins can also use the Tasks page).', 'প্রজেক্ট খুলে Tasks অংশে **+ New Task**-এ ক্লিক করুন (অ্যাডমিন Tasks পেজ থেকেও পারেন)।'),
            t('Fill in the form. Almost every field is required: **Task Title**, **Project**, **Category**, **Function**, **Department**, **Task Type**, **Priority**, **Status**, **Description**, **Expected Deliverable**, **Responsible**, **Accountable**, **Reviewer**, **Planned Start** and **Baseline Due Date**. **Informed** is optional.', 'ফর্ম পূরণ করুন। প্রায় সব ঘরই আবশ্যক: **Task Title**, **Project**, **Category**, **Function**, **Department**, **Task Type**, **Priority**, **Status**, **Description**, **Expected Deliverable**, **Responsible**, **Accountable**, **Reviewer**, **Planned Start** ও **Baseline Due Date**। **Informed** ঐচ্ছিক।'),
            t('Save. The task code (TSK-0001…) is given automatically; the Responsible and Informed people are notified.', 'Save করুন। টাস্ক কোড (TSK-0001…) স্বয়ংক্রিয়ভাবে আসে; Responsible ও Informed ব্যক্তি নোটিফিকেশন পান।'),
          ),
          list(
            t('The SBU is not chosen on the task: **Project SBU** always comes from the project, and changes with it.', 'টাস্কে SBU বাছতে হয় না: **Project SBU** সবসময় প্রজেক্ট থেকে আসে এবং প্রজেক্টের সাথে বদলায়।'),
            t('**Built by** (Function and Department) is the team that builds the task. It is filled from your profile; change it if another team builds it.', '**Built by** (Function ও Department) হলো যে দল টাস্কটি করছে। এটি আপনার প্রোফাইল থেকে পূরণ হয়; অন্য দল করলে বদলে দিন।'),
            t('Category, Task Type, Priority and Status are lists you can also type into; a new value is added to the list.', 'Category, Task Type, Priority ও Status-এর তালিকায় নতুন মান টাইপও করা যায়; সেটি তালিকায় যোগ হয়।'),
            t('The planned start cannot be after the baseline due date.', 'Planned Start, Baseline Due Date-এর পরে হতে পারে না।'),
            t('In a project with the Gantt chart on, **Depends on** lets you choose the tasks that must finish first.', 'Gantt চার্ট চালু থাকা প্রজেক্টে **Depends on** দিয়ে আগে শেষ হতে হবে এমন টাস্ক বাছা যায়।'),
          ),
          tip('Write the **Expected Deliverable** as something a Reviewer can check: "Signed UAT report", not "Testing".',
            '**Expected Deliverable** এমনভাবে লিখুন যা Reviewer যাচাই করতে পারেন: "স্বাক্ষরিত UAT রিপোর্ট" — শুধু "টেস্টিং" নয়।'),
        ],
      },
      {
        id: 'task-status', title: t('Task statuses', 'টাস্কের স্ট্যাটাস'),
        blocks: [
          table(
            [t('Status', 'স্ট্যাটাস'), t('Use it when', 'কখন ব্যবহার করবেন')],
            [t('Draft / Backlog', 'Draft / Backlog'), t('Noted but not planned yet.', 'লেখা হয়েছে, কিন্তু এখনো পরিকল্পনায় আসেনি।')],
            [t('Ready', 'Ready'), t('Planned and ready to start.', 'পরিকল্পিত এবং শুরু করার জন্য প্রস্তুত।')],
            [t('In Progress', 'In Progress'), t('Work has started.', 'কাজ শুরু হয়েছে।')],
            [t('In Review', 'In Review'), t('Work is done and is being checked.', 'কাজ শেষ, যাচাই চলছে।')],
            [t('Blocked', 'Blocked'), t('Cannot continue until something is solved.', 'কোনো সমস্যা সমাধান না হলে এগোনো যাচ্ছে না।')],
            [t('On Hold', 'On Hold'), t('Paused on purpose.', 'ইচ্ছাকৃতভাবে স্থগিত।')],
            [t('Completed / Closed', 'Completed / Closed'), t('Finished and approved.', 'শেষ ও অনুমোদিত।')],
            [t('Cancelled', 'Cancelled'), t('Will not be done. Left out of the KPI.', 'করা হবে না। KPI-তে গণনা হয় না।')],
          ),
          list(
            t('The first time a task goes In Progress, or its progress is above 0, today is saved as its **Actual Start**.', 'প্রথমবার টাস্ক In Progress হলে বা অগ্রগতি ০-এর বেশি হলে আজকের তারিখ **Actual Start** হিসেবে সেভ হয়।'),
            t('Completed or closed sets progress to 100% and saves today as the **Actual Completion** date.', 'Completed বা closed হলে অগ্রগতি ১০০% হয় এবং আজকের তারিখ **Actual Completion** হিসেবে সেভ হয়।'),
            t('Setting progress to 100% does **not** complete the task. Use **Submit for Completion**.', 'অগ্রগতি ১০০% করলেই টাস্ক সম্পন্ন হয় **না**। **Submit for Completion** ব্যবহার করুন।'),
          ),
        ],
      },
      {
        id: 'task-progress', title: t('Update progress', 'অগ্রগতি আপডেট করা'),
        lead: t('The Responsible or Accountable person does this - at least once a week.', 'Responsible বা Accountable ব্যক্তি এটি করেন — অন্তত সপ্তাহে একবার।'),
        blocks: [
          steps(
            t('Open the task and click **+ Update Progress**.', 'টাস্ক খুলে **+ Update Progress**-এ ক্লিক করুন।'),
            t('Set **Progress %** and the **Status**.', '**Progress %** ও **Status** দিন।'),
            t('Write **Remarks** (what was done) and the **Next Action**.', '**Remarks** (কী করা হয়েছে) ও **Next Action** লিখুন।'),
            t('If something stops you, tick **Blocker** and describe it in **Blocker Details** - the task turns red so people notice.', 'কোনো বাধা থাকলে **Blocker**-এ টিক দিয়ে **Blocker Details**-এ লিখুন — টাস্ক লাল হয়, যাতে সবার নজরে আসে।'),
            t('If you now expect a different finish date, set **Forecast Completion**.', 'শেষ হওয়ার তারিখ বদলাবে মনে হলে **Forecast Completion** দিন।'),
            t('Save. The Informed person is notified.', 'Save করুন। Informed ব্যক্তি নোটিফিকেশন পান।'),
          ),
          warn('You cannot choose Completed here (only admin, privileged roles and the SBU\'s COO can). Finish a task with **Submit for Completion**.',
            'এখানে আপনি Completed বাছতে পারবেন না (শুধু অ্যাডমিন, প্রিভিলেজড রোল ও SBU-এর COO পারেন)। টাস্ক শেষ করতে **Submit for Completion** ব্যবহার করুন।'),
          info('Files cannot be uploaded. Put a link (for example to Google Drive) in the Remarks instead.',
            'ফাইল আপলোড করা যায় না। Remarks-এ লিংক দিন (যেমন Google Drive-এর)।'),
        ],
      },
      {
        id: 'task-complete', title: t('Finish a task: Submit for Completion', 'টাস্ক শেষ করা: Submit for Completion'),
        blocks: [
          steps(
            t('Update progress to **100%** with remarks about what was delivered.', 'কী ডেলিভার করা হয়েছে তা Remarks-এ লিখে অগ্রগতি **১০০%** করুন।'),
            t('On the task page click **Submit for Completion** (the Responsible person also sees **Submit Completion** in task lists once a task is at 100%).', 'টাস্ক পেজে **Submit for Completion**-এ ক্লিক করুন (টাস্ক ১০০% হলে Responsible ব্যক্তি টাস্ক তালিকাতেও **Submit Completion** দেখেন)।'),
            t('The request goes to the **Reviewer**; if there is none, to the **Accountable**; if there is none, to **your line manager**.', 'অনুরোধ যায় **Reviewer**-এর কাছে; না থাকলে **Accountable**-এর কাছে; তাও না থাকলে **আপনার লাইন ম্যানেজারের** কাছে।'),
            t('The approver opens **Approvals** and approves or rejects.', 'অনুমোদনকারী **Approvals** খুলে অনুমোদন বা প্রত্যাখ্যান করেন।'),
            t('**Approved:** the task becomes Completed, progress 100%, and today is saved as the completion date. **Rejected:** the task stays as it was.', '**অনুমোদিত হলে:** টাস্ক Completed হয়, অগ্রগতি ১০০% এবং আজকের তারিখ সমাপ্তির তারিখ হিসেবে সেভ হয়। **প্রত্যাখ্যাত হলে:** টাস্ক আগের মতোই থাকে।'),
          ),
          list(
            t('After a rejection, fix the work, save a new progress update, then submit again. Until then the button shows **✓ Submitted**.', 'প্রত্যাখ্যানের পর কাজ ঠিক করে নতুন করে অগ্রগতি আপডেট সেভ করুন, তারপর আবার সাবমিট করুন। তার আগে বাটনে **✓ Submitted** দেখায়।'),
            t('The completion date is the day of **approval**, not the day you submitted. Submit early enough for the approver to decide before the due date.', 'সমাপ্তির তারিখ হলো **অনুমোদনের** দিন, সাবমিটের দিন নয়। তাই মেয়াদের আগে অনুমোদনকারী যেন সিদ্ধান্ত দিতে পারেন, সেভাবে আগে সাবমিট করুন।'),
          ),
          tip('Approvers: decide completion requests the same day. A late approval makes the task count as late in the KPI of everyone on it.',
            'অনুমোদনকারীদের জন্য: সম্পন্ন করার অনুরোধে সেদিনই সিদ্ধান্ত দিন। দেরিতে অনুমোদন দিলে ওই টাস্কের সবার KPI-তে টাস্কটি "দেরিতে সম্পন্ন" হিসেবে গণনা হয়।'),
        ],
      },
      {
        id: 'task-dates', title: t('Dates, date revision and delays', 'তারিখ, তারিখ পরিবর্তন ও বিলম্ব'),
        blocks: [
          table(
            [t('Date', 'তারিখ'), t('Meaning', 'অর্থ'), t('Who sets it', 'কে দেন')],
            [t('Planned Start', 'Planned Start'), t('When work should begin.', 'কাজ কবে শুরু হওয়ার কথা।'), t('Whoever creates or edits the task.', 'যিনি টাস্ক তৈরি বা এডিট করেন।')],
            [t('Baseline Due', 'Baseline Due'), t('The first agreed due date. It never changes afterwards.', 'প্রথম সম্মত শেষ তারিখ। পরে আর বদলায় না।'), t('Set at creation; locked for Responsible / Accountable once set.', 'তৈরির সময় দেওয়া হয়; একবার দিলে Responsible / Accountable-এর জন্য লক হয়।')],
            [t('Approved Due', 'Approved Due'), t('The due date in force. The KPI and "overdue" use this one.', 'কার্যকর শেষ তারিখ। KPI ও "overdue" এটিই ব্যবহার করে।'), t('Equals baseline at first; changes by an approved date revision, by the Project Manager\'s **Change Dates**, or by a privileged user.', 'শুরুতে baseline-এর সমান; অনুমোদিত তারিখ পরিবর্তন, Project Manager-এর **Change Dates**, অথবা প্রিভিলেজড ইউজার দ্বারা বদলায়।')],
            [t('Forecast', 'Forecast'), t('When you now expect to finish.', 'এখন কবে শেষ হবে বলে আশা করছেন।'), t('A progress update, a delay record, or the Gantt schedule.', 'অগ্রগতি আপডেট, Delay রেকর্ড, অথবা Gantt সময়সূচি।')],
            [t('Actual Start / Completion', 'Actual Start / Completion'), t('When work really started and was completed.', 'কাজ প্রকৃতপক্ষে কবে শুরু ও শেষ হয়েছে।'), t('Saved automatically.', 'স্বয়ংক্রিয়ভাবে সেভ হয়।')],
          ),
          h('Ask for a new due date', 'নতুন শেষ তারিখ চাওয়া'),
          steps(
            t('Open the task and click **Request Date Revision**.', 'টাস্ক খুলে **Request Date Revision**-এ ক্লিক করুন।'),
            t('Enter the **Proposed New Due Date** and the **Reason** (both required).', '**Proposed New Due Date** ও **Reason** দিন (দুটোই আবশ্যক)।'),
            t('The request goes to the task\'s **Reviewer**. Approved: the Approved Due becomes the new date. Rejected: it stays.', 'অনুরোধ যায় টাস্কের **Reviewer**-এর কাছে। অনুমোদিত হলে Approved Due নতুন তারিখ হয়। প্রত্যাখ্যাত হলে আগেরটিই থাকে।'),
          ),
          warn('Ask before the due date passes, and give the real reason. The Forecast date changes as soon as you send the request, even if it is later rejected.',
            'মেয়াদ পার হওয়ার আগেই অনুরোধ করুন এবং প্রকৃত কারণ লিখুন। অনুরোধ পাঠানোর সাথে সাথেই Forecast তারিখ বদলে যায় — পরে প্রত্যাখ্যাত হলেও।'),
          h('Log a delay', 'বিলম্ব (Delay) লেখা'),
          p('On the task page click **+ Log Delay** and give the **Delay Category** and **Delay Reason** (required), plus the impact in days, root cause, recovery action, proposed revised date and recovery owner. The task turns amber and the proposed date becomes the Forecast. This records why; it does not change the due date - use Request Date Revision for that.',
            'টাস্ক পেজে **+ Log Delay**-এ ক্লিক করে **Delay Category** ও **Delay Reason** (আবশ্যক) দিন; সাথে কত দিনের প্রভাব, মূল কারণ, পুনরুদ্ধারের পদক্ষেপ, প্রস্তাবিত নতুন তারিখ ও দায়িত্বপ্রাপ্ত ব্যক্তি। টাস্ক হলুদ (amber) হয় এবং প্রস্তাবিত তারিখ Forecast হয়। এটি শুধু কারণ রেকর্ড করে; শেষ তারিখ বদলায় না — তার জন্য Request Date Revision ব্যবহার করুন।'),
        ],
      },
      {
        id: 'task-delete', title: t('Delete a task', 'টাস্ক মুছে ফেলা'),
        blocks: [
          list(
            t('**Responsible / Accountable:** click **Delete Task** and give a reason. The task is hidden and a request goes to the **Project Manager** (to the admins if the project has none).', '**Responsible / Accountable:** **Delete Task**-এ ক্লিক করে কারণ দিন। টাস্ক লুকিয়ে যায় এবং অনুরোধ যায় **Project Manager**-এর কাছে (প্রজেক্টে না থাকলে অ্যাডমিনদের কাছে)।'),
            t('**Project Manager:** approving deletes the task permanently; rejecting restores it.', '**Project Manager:** অনুমোদন করলে টাস্ক স্থায়ীভাবে মুছে যায়; প্রত্যাখ্যান করলে ফিরে আসে।'),
            t('**Project Manager or admin** deleting a task themselves: it is deleted at once, after a confirmation.', '**Project Manager বা অ্যাডমিন** নিজে মুছলে: নিশ্চিত করার পর সাথে সাথে মুছে যায়।'),
          ),
          warn('A permanent delete removes the task\'s progress history, delay records and approvals. If a task is simply no longer needed, set its status to **Cancelled** instead.',
            'স্থায়ীভাবে মুছলে টাস্কের অগ্রগতির ইতিহাস, Delay রেকর্ড ও অনুমোদন মুছে যায়। টাস্কের আর প্রয়োজন না থাকলে বরং স্ট্যাটাস **Cancelled** করুন।'),
        ],
      },
      {
        id: 'comments', title: t('Comments', 'মন্তব্য (Comments)'),
        blocks: [
          list(
            t('Anyone can comment on a task or project (up to 2000 characters).', 'যে কেউ টাস্ক বা প্রজেক্টে মন্তব্য করতে পারেন (সর্বোচ্চ ২০০০ অক্ষর)।'),
            t('A task comment is seen by its author, the task\'s **Responsible** and **Accountable**, and admins. A project comment is seen by its author, the **Project Manager** and admins.', 'টাস্কের মন্তব্য দেখেন লেখক, টাস্কের **Responsible** ও **Accountable** এবং অ্যাডমিন। প্রজেক্টের মন্তব্য দেখেন লেখক, **Project Manager** ও অ্যাডমিন।'),
            t('Only the Responsible / Accountable (or the Project Manager) can reply. They are notified in the system and by email; the author is notified of the reply.', 'শুধু Responsible / Accountable (অথবা Project Manager) উত্তর দিতে পারেন। তাঁরা সিস্টেমে ও ইমেইলে জানতে পারেন; উত্তর এলে লেখককে জানানো হয়।'),
            t('Your comments and replies also appear in the **Comments** box on My Dashboard.', 'আপনার মন্তব্য ও উত্তর My Dashboard-এর **Comments** বক্সেও দেখা যায়।'),
          ),
        ],
      },
      {
        id: 'kanban', title: t('Kanban board', 'Kanban বোর্ড'),
        blocks: [
          list(
            t('Columns: **Backlog, Ready, In Progress, In Review, Blocked, Completed**. Tasks in other statuses are not shown.', 'কলাম: **Backlog, Ready, In Progress, In Review, Blocked, Completed**। অন্য স্ট্যাটাসের টাস্ক দেখায় না।'),
            t('Drag a card to another column (or use **Move to…**) to change its status. Only the Responsible, Accountable, privileged roles and the SBU\'s COO can move a card.', 'স্ট্যাটাস বদলাতে কার্ড টেনে অন্য কলামে নিন (অথবা **Move to…** ব্যবহার করুন)। শুধু Responsible, Accountable, প্রিভিলেজড রোল ও SBU-এর COO কার্ড সরাতে পারেন।'),
            t('You cannot drag a card into **Completed** - open the task and use Submit for Completion.', 'কার্ড টেনে **Completed**-এ নেওয়া যায় না — টাস্ক খুলে Submit for Completion ব্যবহার করুন।'),
            t('Filters: SBU, Function, Department, Project, Responsible, Priority. Click a card to open the task.', 'ফিল্টার: SBU, Function, Department, Project, Responsible, Priority। কার্ডে ক্লিক করলে টাস্ক খোলে।'),
          ),
        ],
      },
      {
        id: 'backlog', title: t('Backlog', 'Backlog'),
        lead: t('A place to note a requirement before it is ready to be a task.', 'কোনো চাহিদা টাস্ক হওয়ার আগে লিখে রাখার জায়গা।'),
        blocks: [
          list(
            t('An item has a **Requirement**, description, project, priority, estimated effort (days) and acceptance criteria.', 'প্রতিটি আইটেমে থাকে **Requirement**, বিবরণ, প্রজেক্ট, অগ্রাধিকার, আনুমানিক শ্রম (দিন) ও গ্রহণযোগ্যতার শর্ত।'),
            t('**Convert to Task** (click twice to confirm) creates a task in status Backlog with no people or dates. Open that task and fill in the people and dates.', '**Convert to Task** (নিশ্চিত করতে দুবার ক্লিক) করলে Backlog স্ট্যাটাসে একটি টাস্ক তৈরি হয়, যাতে ব্যক্তি বা তারিখ থাকে না। টাস্কটি খুলে ব্যক্তি ও তারিখ দিন।'),
            t('Filters: SBU, Function, Project, Status, Priority.', 'ফিল্টার: SBU, Function, Project, Status, Priority।'),
          ),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 5. Approvals
  {
    id: 'approvals', audience: 'all', title: t('5. Approvals: who approves what', '৫. অনুমোদন: কে কী অনুমোদন করেন'),
    sections: [
      {
        id: 'approval-matrix', title: t('The approval table', 'অনুমোদনের ছক'),
        lead: t('Nobody can approve their own request.', 'কেউ নিজের অনুরোধ নিজে অনুমোদন করতে পারেন না।'),
        blocks: [
          table(
            [t('Request', 'অনুরোধ'), t('Who asks', 'কে করেন'), t('Who approves', 'কে অনুমোদন করেন'), t('If approved', 'অনুমোদিত হলে'), t('If rejected', 'প্রত্যাখ্যাত হলে')],
            [t('**Task completion**', '**টাস্ক সম্পন্ন করা**'), t('Responsible or Accountable, with **Submit for Completion**', 'Responsible বা Accountable, **Submit for Completion** দিয়ে'), t('Reviewer → if none, Accountable → if none, the requester\'s line manager. The Reviewer or Accountable can also decide it.', 'Reviewer → না থাকলে Accountable → না থাকলে অনুরোধকারীর লাইন ম্যানেজার। Reviewer বা Accountable-ও সিদ্ধান্ত দিতে পারেন।'), t('Task Completed, 100%, completion date = today', 'টাস্ক Completed, ১০০%, সমাপ্তির তারিখ = আজ'), t('Task unchanged; update progress and submit again', 'টাস্ক অপরিবর্তিত; অগ্রগতি আপডেট করে আবার সাবমিট করুন')],
            [t('**Due-date revision**', '**শেষ তারিখ পরিবর্তন**'), t('Responsible or Accountable, with **Request Date Revision**', 'Responsible বা Accountable, **Request Date Revision** দিয়ে'), t('The task\'s **Reviewer** only', 'শুধু টাস্কের **Reviewer**'), t('Approved Due = the proposed date', 'Approved Due = প্রস্তাবিত তারিখ'), t('Approved Due unchanged', 'Approved Due অপরিবর্তিত')],
            [t('**Task deletion**', '**টাস্ক মুছে ফেলা**'), t('Responsible or Accountable, with **Delete Task**', 'Responsible বা Accountable, **Delete Task** দিয়ে'), t('The **Project Manager** (admins if the project has none)', '**Project Manager** (প্রজেক্টে না থাকলে অ্যাডমিন)'), t('Task deleted permanently', 'টাস্ক স্থায়ীভাবে মুছে যায়'), t('Task restored', 'টাস্ক ফিরে আসে')],
            [t('**Methodology document**', '**Methodology ডকুমেন্ট**'), t('The Project Manager adds the link', 'Project Manager লিংক যোগ করেন'), t('Three assigned approvers: Group Executive, Team Lead, Function Head', 'তিনজন নির্ধারিত অনুমোদনকারী: Group Executive, Team Lead, Function Head'), t('Badge "Approved" when all three approve', 'তিনজনই অনুমোদন করলে ব্যাজ "Approved"'), t('Badge "Rejected"; fix the document and change the link', 'ব্যাজ "Rejected"; ডকুমেন্ট ঠিক করে লিংক বদলান')],
          ),
          list(
            t('An **admin** and the **COO of the task\'s SBU** can also decide completion, date-revision and deletion requests.', '**অ্যাডমিন** এবং **টাস্কের SBU-এর COO**-ও সম্পন্ন করা, তারিখ পরিবর্তন ও মুছে ফেলার অনুরোধে সিদ্ধান্ত দিতে পারেন।'),
            t('The **Project Manager** changes a task\'s dates directly with **🗓 Change Dates** - no approval needed; everyone on the task is notified.', '**Project Manager** **🗓 Change Dates** দিয়ে সরাসরি টাস্কের তারিখ বদলাতে পারেন — অনুমোদন লাগে না; টাস্কের সবাইকে জানানো হয়।'),
            t('Approval requests and results appear in **Notifications** inside the system; no email is sent for them, so check the red number on the menu.', 'অনুমোদনের অনুরোধ ও ফলাফল সিস্টেমের **Notifications**-এ আসে; এর জন্য ইমেইল যায় না, তাই মেনুর লাল সংখ্যাটি খেয়াল রাখুন।'),
          ),
        ],
      },
      {
        id: 'approval-decide', title: t('Decide a request', 'অনুরোধে সিদ্ধান্ত দেওয়া'),
        blocks: [
          steps(
            t('Open **Approvals**. The red number on the menu is how many wait for you.', '**Approvals** খুলুন। মেনুর লাল সংখ্যাটি দেখায় কয়টি আপনার অপেক্ষায়।'),
            t('Click a request to open it and read the task, the reason and the dates.', 'অনুরোধে ক্লিক করে খুলুন এবং টাস্ক, কারণ ও তারিখগুলো পড়ুন।'),
            t('Open the task itself and check the **Expected Deliverable** and the progress remarks.', 'টাস্কটি খুলে **Expected Deliverable** ও অগ্রগতির Remarks যাচাই করুন।'),
            t('Click **Approve** or **Reject**. When you reject, write what must be fixed.', '**Approve** বা **Reject**-এ ক্লিক করুন। প্রত্যাখ্যান করলে কী ঠিক করতে হবে তা লিখুন।'),
          ),
          tip('Decide within one working day. Until you do, the task cannot be completed and its people lose On-Time score.',
            'এক কর্মদিবসের মধ্যে সিদ্ধান্ত দিন। সিদ্ধান্ত না দেওয়া পর্যন্ত টাস্ক সম্পন্ন হয় না এবং সংশ্লিষ্টদের On-Time স্কোর কমে।'),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 6. Edit and see
  {
    id: 'rights', audience: 'all', title: t('6. Who can edit and see what', '৬. কে কী এডিট ও দেখতে পারেন'),
    sections: [
      {
        id: 'edit-task', title: t('Editing a task', 'টাস্ক এডিট করা'),
        blocks: [
          table(
            [t('What', 'বিষয়'), t('Responsible', 'Responsible'), t('Accountable', 'Accountable'), t('Reviewer / Informed', 'Reviewer / Informed'), t('Admin, privileged, SBU\'s COO', 'অ্যাডমিন, প্রিভিলেজড, SBU-এর COO')],
            [t('Title, description, deliverable, category, type, priority, project, function, department, planned start', 'শিরোনাম, বিবরণ, ডেলিভারেবল, ক্যাটাগরি, ধরন, অগ্রাধিকার, প্রজেক্ট, ফাংশন, ডিপার্টমেন্ট, Planned Start'), t('Yes', 'হ্যাঁ'), t('Yes', 'হ্যাঁ'), t('No', 'না'), t('Yes', 'হ্যাঁ')],
            [t('Progress, status, blocker, forecast, remarks', 'অগ্রগতি, স্ট্যাটাস, Blocker, Forecast, Remarks'), t('Yes', 'হ্যাঁ'), t('Yes', 'হ্যাঁ'), t('No', 'না'), t('Yes', 'হ্যাঁ')],
            [t('The Responsible person', 'Responsible ব্যক্তি'), t('Yes', 'হ্যাঁ'), t('Yes', 'হ্যাঁ'), t('No', 'না'), t('Yes', 'হ্যাঁ')],
            [t('Accountable, Reviewer, Informed', 'Accountable, Reviewer, Informed'), t('Yes', 'হ্যাঁ'), t('No', 'না'), t('No', 'না'), t('Yes', 'হ্যাঁ')],
            [t('Baseline due date', 'Baseline due date'), t('Only if still empty', 'শুধু খালি থাকলে'), t('Only if still empty', 'শুধু খালি থাকলে'), t('No', 'না'), t('Yes', 'হ্যাঁ')],
            [t('Approved due date', 'Approved due date'), t('By Request Date Revision', 'Request Date Revision দিয়ে'), t('By Request Date Revision', 'Request Date Revision দিয়ে'), t('The Reviewer approves the revision', 'Reviewer পরিবর্তন অনুমোদন করেন'), t('Yes', 'হ্যাঁ')],
            [t('Set status to Completed / Closed', 'স্ট্যাটাস Completed / Closed করা'), t('By Submit for Completion', 'Submit for Completion দিয়ে'), t('By Submit for Completion', 'Submit for Completion দিয়ে'), t('The Reviewer approves it', 'Reviewer অনুমোদন করেন'), t('Yes, directly', 'হ্যাঁ, সরাসরি')],
            [t('Delete the task', 'টাস্ক মুছে ফেলা'), t('Asks; the Project Manager decides', 'অনুরোধ করেন; Project Manager সিদ্ধান্ত নেন'), t('Asks; the Project Manager decides', 'অনুরোধ করেন; Project Manager সিদ্ধান্ত নেন'), t('No', 'না'), t('Yes', 'হ্যাঁ')],
          ),
          info('The Project Manager is not in this table as an editor, but can change any task\'s dates with **🗓 Change Dates** and delete tasks.',
            'Project Manager এই ছকে এডিটর হিসেবে নেই, তবে তিনি **🗓 Change Dates** দিয়ে যেকোনো টাস্কের তারিখ বদলাতে এবং টাস্ক মুছতে পারেন।'),
          warn('The Reviewer cannot edit a task on purpose: editing would mean approving their own changes.',
            'Reviewer ইচ্ছাকৃতভাবেই টাস্ক এডিট করতে পারেন না: এডিট করলে নিজের পরিবর্তন নিজেই অনুমোদন করা হতো।'),
        ],
      },
      {
        id: 'edit-project', title: t('Editing a project', 'প্রজেক্ট এডিট করা'),
        blocks: [
          table(
            [t('Action', 'কাজ'), t('Who can', 'কে পারেন')],
            [t('Create a project', 'প্রজেক্ট তৈরি'), t('Anyone', 'যে কেউ')],
            [t('**✎ Edit Project**', '**✎ Edit Project**'), t('Admin / privileged roles, the COO of its SBU, the Project Manager, and anyone Responsible or Accountable on one of its tasks', 'অ্যাডমিন / প্রিভিলেজড রোল, SBU-এর COO, Project Manager, এবং প্রজেক্টের যেকোনো টাস্কের Responsible বা Accountable')],
            [t('Add / edit / remove associated people', 'সংশ্লিষ্ট ব্যক্তি যোগ / এডিট / বাদ'), t('Whoever can edit the project, plus its Manager and Owner', 'যাঁরা প্রজেক্ট এডিট করতে পারেন, সাথে Manager ও Owner')],
            [t('Switch the Gantt chart on / off, set dependencies', 'Gantt চার্ট চালু / বন্ধ, নির্ভরশীলতা ঠিক করা'), t('The same people as above', 'উপরের একই ব্যক্তিরা')],
            [t('Methodology link and approvers', 'Methodology লিংক ও অনুমোদনকারী'), t('The Project Manager, admin / privileged roles', 'Project Manager, অ্যাডমিন / প্রিভিলেজড রোল')],
            [t('Delete the project', 'প্রজেক্ট মুছে ফেলা'), t('The Project Manager or an admin', 'Project Manager অথবা অ্যাডমিন')],
          ),
        ],
      },
      {
        id: 'see', title: t('What you can see', 'আপনি যা দেখতে পারেন'),
        blocks: [
          list(
            t('**A project and all its tasks** - if you are its Manager or Owner, an associated person, or Responsible / Accountable / Reviewer / Informed on any of its tasks.', '**একটি প্রজেক্ট ও তার সব টাস্ক** — যদি আপনি তার Manager বা Owner, সংশ্লিষ্ট ব্যক্তি, অথবা তার কোনো টাস্কের Responsible / Accountable / Reviewer / Informed হন।'),
            t('**A single task** - if you are named on it, or you asked for or must decide an approval on it.', '**একটি টাস্ক** — যদি তাতে আপনার নাম থাকে, অথবা তার কোনো অনুমোদনের অনুরোধকারী বা সিদ্ধান্তদাতা হন।'),
            t('**Everything of what you head** - see "System roles" above.', '**আপনি যার প্রধান তার সবকিছু** — উপরের "সিস্টেম রোল" দেখুন।'),
            t('If a colleague cannot see a project, add them to a task or as an associated person.', 'কোনো সহকর্মী প্রজেক্ট দেখতে না পেলে তাঁকে কোনো টাস্কে বা সংশ্লিষ্ট ব্যক্তি হিসেবে যোগ করুন।'),
            t('The **Audit Trail** is open to every user.', '**Audit Trail** সব ইউজারের জন্য উন্মুক্ত।'),
          ),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 7. Follow-up
  {
    id: 'follow', audience: 'all', title: t('7. Follow-up pages', '৭. ফলো-আপ পেজ'),
    sections: [
      {
        id: 'dashboard', title: t('My Dashboard', 'My Dashboard'),
        blocks: [
          list(
            t('**Number cards:** click **Projects** to list your projects; click **Total Tasks, Open, Due Today, Overdue, Critical** or **Blocked** to list those tasks; click again to clear.', '**সংখ্যার কার্ড:** আপনার প্রজেক্ট দেখতে **Projects**-এ ক্লিক করুন; ওই টাস্কগুলো দেখতে **Total Tasks, Open, Due Today, Overdue, Critical** বা **Blocked**-এ ক্লিক করুন; আবার ক্লিক করলে ফিল্টার সরে যায়।'),
            t('**My Tasks / My Projects:** switch between them, filter and sort; click a row to open it.', '**My Tasks / My Projects:** দুটির মধ্যে বদলান, ফিল্টার ও সাজান; সারিতে ক্লিক করলে খোলে।'),
            t('**Calendar:** click a day to see the tasks due that day.', '**Calendar:** কোনো দিনে ক্লিক করলে সেদিনের মেয়াদের টাস্ক দেখায়।'),
            t('**Comments:** read and reply to comments on your tasks and projects.', '**Comments:** আপনার টাস্ক ও প্রজেক্টের মন্তব্য পড়ুন ও উত্তর দিন।'),
            t('**Team & Portfolio Breakdown:** numbers by SBU, function and department; click a name to see its projects.', '**Team & Portfolio Breakdown:** SBU, Function ও Department অনুযায়ী সংখ্যা; নামে ক্লিক করলে প্রজেক্ট দেখায়।'),
            t('The dashboard refreshes by itself every minute.', 'ড্যাশবোর্ড প্রতি মিনিটে নিজে থেকে হালনাগাদ হয়।'),
          ),
        ],
      },
      {
        id: 'notifications', title: t('Notifications and emails', 'নোটিফিকেশন ও ইমেইল'),
        blocks: [
          table(
            [t('Event', 'ঘটনা'), t('Who is told', 'কাকে জানানো হয়'), t('How', 'কীভাবে')],
            [t('Task assigned to you', 'আপনাকে টাস্ক দেওয়া হলে'), t('Responsible; Informed', 'Responsible; Informed'), t('In the system', 'সিস্টেমে')],
            [t('Status or progress changed', 'স্ট্যাটাস বা অগ্রগতি বদলালে'), t('Informed', 'Informed'), t('In the system', 'সিস্টেমে')],
            [t('Approval requested or decided', 'অনুমোদনের অনুরোধ বা সিদ্ধান্ত'), t('The approver, the requester and the people on the task', 'অনুমোদনকারী, অনুরোধকারী ও টাস্কের ব্যক্তিরা'), t('In the system', 'সিস্টেমে')],
            [t('Project Manager changed a task\'s dates', 'Project Manager টাস্কের তারিখ বদলালে'), t('Everyone on the task and the project\'s people', 'টাস্কের সবাই ও প্রজেক্টের ব্যক্তিরা'), t('In the system', 'সিস্টেমে')],
            [t('Comment or reply', 'মন্তব্য বা উত্তর'), t('Responsible and Accountable (or the Project Manager); the author for a reply', 'Responsible ও Accountable (অথবা Project Manager); উত্তরের ক্ষেত্রে লেখক'), t('In the system and by email', 'সিস্টেমে ও ইমেইলে')],
            [t('Task due within 3 days or overdue', 'টাস্কের মেয়াদ ৩ দিনের মধ্যে বা পার হলে'), t('Responsible, Accountable, Project Manager', 'Responsible, Accountable, Project Manager'), t('Email, once a day', 'ইমেইল, দিনে একবার')],
            [t('Task completed', 'টাস্ক সম্পন্ন হলে'), t('Project Manager, Accountable', 'Project Manager, Accountable'), t('Email', 'ইমেইল')],
            [t('Backlog item open 7 days or more', 'Backlog আইটেম ৭ দিন বা বেশি পড়ে থাকলে'), t('The requester, Project Manager', 'অনুরোধকারী, Project Manager'), t('Email, once a day', 'ইমেইল, দিনে একবার')],
            [t('Meeting scheduled', 'মিটিং নির্ধারিত হলে'), t('The invited people', 'আমন্ত্রিত ব্যক্তিরা'), t('In the system; email with a calendar file for people on the project\'s tasks', 'সিস্টেমে; প্রজেক্টের টাস্কের ব্যক্তিদের ক্যালেন্ডার ফাইলসহ ইমেইল')],
            [t('Methodology decision', 'Methodology সিদ্ধান্ত'), t('The Project Manager', 'Project Manager'), t('In the system and by email', 'সিস্টেমে ও ইমেইলে')],
          ),
          list(
            t('On **Notifications**, click a line to open the task, project or approval; **Mark read** clears it.', '**Notifications**-এ কোনো লাইনে ক্লিক করলে টাস্ক, প্রজেক্ট বা অনুমোদন খোলে; **Mark read** দিলে পঠিত হয়।'),
            t('**Run Escalation Scan** sends reminders now to the Responsible and Accountable people of tasks that are due soon or overdue.', '**Run Escalation Scan** দিলে শীঘ্রই মেয়াদ শেষ হবে বা মেয়াদ পার হয়েছে এমন টাস্কের Responsible ও Accountable ব্যক্তিদের এখনই স্মরণ করিয়ে দেওয়া হয়।'),
          ),
        ],
      },
      {
        id: 'governance', title: t('Actions & Decisions (meetings)', 'Actions & Decisions (মিটিং)'),
        lead: t('From a meeting to a decision, to an action, to a task - so nothing agreed in a meeting is lost.', 'মিটিং থেকে সিদ্ধান্ত, সিদ্ধান্ত থেকে করণীয়, করণীয় থেকে টাস্ক — যাতে মিটিংয়ে ঠিক হওয়া কিছুই হারিয়ে না যায়।'),
        blocks: [
          steps(
            t('**+ Schedule Meeting:** choose the **Project**, give a **Title**, **Type**, **Date**, **Time**, **Purpose / Agenda** and a location or link, and tick who to invite. Anyone on the project can schedule one.', '**+ Schedule Meeting:** **Project** বেছে **Title**, **Type**, **Date**, **Time**, **Purpose / Agenda** ও স্থান বা লিংক দিন এবং কাকে আমন্ত্রণ করবেন তাতে টিক দিন। প্রজেক্টের যে কেউ মিটিং ডাকতে পারেন।'),
            t('After the meeting, click **+ Decision** on its row: write the **Decision** and choose its **Owner**.', 'মিটিংয়ের পর তার সারিতে **+ Decision**-এ ক্লিক করুন: **Decision** লিখে **Owner** বাছুন।'),
            t('On an open decision click **+ Action**: write the **Action**, the **Responsible** person and the **Due Date**.', 'খোলা সিদ্ধান্তে **+ Action**-এ ক্লিক করুন: **Action**, **Responsible** ব্যক্তি ও **Due Date** দিন।'),
            t('Click **→ Task** to turn an action into a task in the decision\'s project, then fill in its people and dates.', 'করণীয়কে সিদ্ধান্তের প্রজেক্টে টাস্ক বানাতে **→ Task**-এ ক্লিক করুন, তারপর ব্যক্তি ও তারিখ দিন।'),
            t('**Close** an action with **Evidence of completion** (required); **Close** the decision when its actions are done.', '**Evidence of completion** (আবশ্যক) দিয়ে করণীয় **Close** করুন; সব করণীয় শেষ হলে সিদ্ধান্ত **Close** করুন।'),
          ),
          info('A meeting cannot be edited or deleted after it is scheduled, and its date cannot be in the past. The Risks and Issues tabs are view-only.',
            'মিটিং নির্ধারণের পর এডিট বা মুছে ফেলা যায় না, এবং অতীতের তারিখ দেওয়া যায় না। Risks ও Issues ট্যাব শুধু দেখার জন্য।'),
        ],
      },
      {
        id: 'raci-audit', title: t('RACI Matrix and Audit Trail', 'RACI Matrix ও Audit Trail'),
        blocks: [
          list(
            t('**RACI Matrix:** tasks down the side, people across the top, and R / A / C / I in each cell, taken from the tasks themselves. Filter by Project, SBU, Function or Department.', '**RACI Matrix:** এক পাশে টাস্ক, উপরে ব্যক্তি, প্রতিটি ঘরে R / A / C / I — যা টাস্ক থেকেই নেওয়া। Project, SBU, Function বা Department অনুযায়ী ফিল্টার করুন।'),
            t('The **RACI gaps detected** banner counts tasks with no Responsible or no Accountable. Open those tasks and fill them in.', '**RACI gaps detected** ব্যানারে Responsible বা Accountable নেই এমন টাস্কের সংখ্যা দেখায়। সেই টাস্কগুলো খুলে পূরণ করুন।'),
            t('**Audit Trail:** the last 500 changes - who, when, what was changed, the old and the new value. Search it or filter by entity.', '**Audit Trail:** সর্বশেষ ৫০০টি পরিবর্তন — কে, কখন, কী বদলেছেন, আগের ও নতুন মান। খুঁজুন বা Entity অনুযায়ী ফিল্টার করুন।'),
          ),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 8. KPI
  {
    id: 'kpi', audience: 'all', title: t('8. KPI', '৮. KPI'),
    sections: [
      {
        id: 'kpi-how', title: t('How your KPI is calculated', 'আপনার KPI কীভাবে হিসাব হয়'),
        lead: t('The KPI is calculated live from your tasks and projects. Nobody types it in.', 'KPI আপনার টাস্ক ও প্রজেক্ট থেকে সরাসরি হিসাব হয়। কেউ এটি হাতে লেখেন না।'),
        blocks: [
          p('You are scored in four roles: **Responsible**, **Accountable** and **Reviewer** on your tasks, and **Project Manager** on the projects you manage.',
            'আপনাকে চারটি রোলে মূল্যায়ন করা হয়: আপনার টাস্কে **Responsible**, **Accountable** ও **Reviewer** হিসেবে, এবং আপনার পরিচালিত প্রজেক্টে **Project Manager** হিসেবে।'),
          table(
            [t('Step', 'ধাপ'), t('Formula', 'সূত্র')],
            [t('Expected progress', 'প্রত্যাশিত অগ্রগতি'), t('Where the task should be today: 0% on its planned start, 100% on its due date.', 'আজ টাস্কটি যেখানে থাকার কথা: Planned Start-এ ০%, শেষ তারিখে ১০০%।')],
            [t('Points of one task / project', 'একটি টাস্ক / প্রজেক্টের পয়েন্ট'), t('Completed = 100. Open = 100 minus the points it is behind the expected progress.', 'সম্পন্ন = ১০০। চলমান = ১০০ থেকে প্রত্যাশিত অগ্রগতির চেয়ে যত পয়েন্ট পিছিয়ে তা বাদ।')],
            [t('Delivery', 'Delivery'), t('The average points of your counted tasks / projects.', 'আপনার গণনাকৃত টাস্ক / প্রজেক্টের গড় পয়েন্ট।')],
            [t('On-Time', 'On-Time'), t('Completed on or before the due date ÷ (completed + open past due).', 'মেয়াদের মধ্যে সম্পন্ন ÷ (সম্পন্ন + মেয়াদ পার হওয়া চলমান)।')],
            [t('Score of a role', 'একটি রোলের স্কোর'), t('Delivery × 60% + On-Time × 40%.', 'Delivery × ৬০% + On-Time × ৪০%।')],
            [t('Total KPI', 'Total KPI'), t('The Task KPI (all your tasks, each once), the Project KPI, or their average if you have both.', 'Task KPI (আপনার সব টাস্ক, প্রতিটি একবার), Project KPI, অথবা দুটিই থাকলে তাদের গড়।')],
          ),
          table(
            [t('Total KPI', 'Total KPI'), t('Rating', 'রেটিং')],
            [t('85 and above', '৮৫ ও তার বেশি'), t('Excellent (the target)', 'Excellent (লক্ষ্য)')],
            [t('70 - 84', '৭০ - ৮৪'), t('Good', 'Good')],
            [t('50 - 69', '৫০ - ৬৯'), t('Fair', 'Fair')],
            [t('Below 50', '৫০-এর নিচে'), t('Needs attention', 'Needs attention')],
          ),
          list(
            t('An example: a task past its due date that is 90% done scores 90 points and counts as late.', 'উদাহরণ: মেয়াদ পার হওয়া একটি টাস্ক ৯০% সম্পন্ন হলে ৯০ পয়েন্ট পায় এবং "দেরি" হিসেবে গণনা হয়।'),
            t('A task whose planned start is still ahead, or that has no due date, is not counted yet. Cancelled and deleted tasks are left out.', 'যে টাস্কের Planned Start এখনো আসেনি বা যার শেষ তারিখ নেই, তা এখনো গণনা হয় না। Cancelled ও মুছে ফেলা টাস্ক বাদ থাকে।'),
            t('On the **KPI** page, click **See the projects and tasks behind it**. The list is by project: click a project to see its tasks and the points of each.', '**KPI** পেজে **See the projects and tasks behind it**-এ ক্লিক করুন। তালিকাটি প্রজেক্ট অনুযায়ী: কোনো প্রজেক্টে ক্লিক করলে তার টাস্ক ও প্রতিটির পয়েন্ট দেখা যায়।'),
            t('Click a role card to narrow the list: **As Responsible** shows only the tasks where the person is Responsible, **As Project Manager** only the projects they manage. **Total KPI** shows everything again.', 'তালিকা ছোট করতে রোল কার্ডে ক্লিক করুন: **As Responsible** শুধু সেই টাস্ক দেখায় যেখানে ব্যক্তি Responsible, **As Project Manager** শুধু তাঁর পরিচালিত প্রজেক্ট। **Total KPI** আবার সব দেখায়।'),
          ),
        ],
      },
      {
        id: 'kpi-good', title: t('How to keep a good score', 'কীভাবে ভালো স্কোর রাখবেন'),
        blocks: [
          list(
            t('**Update progress every week.** A task with old progress looks behind its plan even when the work is done.', '**প্রতি সপ্তাহে অগ্রগতি আপডেট করুন।** কাজ হয়ে গেলেও অগ্রগতি পুরোনো থাকলে টাস্ক পিছিয়ে আছে বলে দেখায়।'),
            t('**Submit for Completion a few days before the due date**, so the approval comes in time.', '**মেয়াদের কয়েক দিন আগে Submit for Completion করুন**, যাতে সময়মতো অনুমোদন হয়।'),
            t('**Ask for a date revision before the due date passes** when a delay is real, with the reason.', 'প্রকৃত বিলম্ব হলে **মেয়াদ পার হওয়ার আগেই কারণসহ তারিখ পরিবর্তনের অনুরোধ করুন**।'),
            t('**Set realistic planned start and due dates** when creating tasks.', 'টাস্ক তৈরির সময় **বাস্তবসম্মত Planned Start ও শেষ তারিখ দিন**।'),
            t('**Cancel tasks that will not be done** instead of leaving them open and overdue.', '**যে টাস্ক করা হবে না তা Cancelled করুন** — খোলা ও মেয়াদোত্তীর্ণ ফেলে রাখবেন না।'),
            t('**Approvers and Accountable people:** a task also counts in your score, so approve quickly and follow up on your team\'s overdue tasks.', '**অনুমোদনকারী ও Accountable ব্যক্তিরা:** টাস্ক আপনার স্কোরেও গণনা হয়, তাই দ্রুত অনুমোদন দিন এবং দলের মেয়াদোত্তীর্ণ টাস্কের খোঁজ নিন।'),
            t('**Project Managers:** your score follows the overall progress of your projects against their dates - keep project dates and task progress up to date.', '**Project Manager-রা:** আপনার স্কোর নির্ভর করে তারিখের তুলনায় প্রজেক্টের সার্বিক অগ্রগতির উপর — প্রজেক্টের তারিখ ও টাস্কের অগ্রগতি হালনাগাদ রাখুন।'),
          ),
        ],
      },
      {
        id: 'kpi-see', title: t('Whose KPI you can see', 'আপনি কার KPI দেখতে পারেন'),
        blocks: [
          table(
            [t('You are', 'আপনি'), t('You see', 'আপনি দেখেন')],
            [t('Anyone', 'যে কেউ'), t('Your own KPI', 'নিজের KPI')],
            [t('A manager', 'ম্যানেজার'), t('Everyone who reports to you, directly or through others', 'সরাসরি বা অন্যের মাধ্যমে আপনার অধীনস্থ সবাই')],
            [t('Department / Functional Head', 'Department / Functional Head'), t('The people of your department / function', 'আপনার Department / Function-এর সবাই')],
            [t('Business Head / COO', 'Business Head / COO'), t('Everyone in your SBU(s), by department', 'আপনার SBU-এর সবাই, Department অনুযায়ী')],
            [t('Admin, privileged roles, Group Executive', 'অ্যাডমিন, প্রিভিলেজড রোল, Group Executive'), t('Every SBU, department and employee', 'সব SBU, Department ও কর্মী')],
          ),
          p('On the KPI page use the tabs: the group KPI (click an SBU to open its departments), the list of people (search, sort, cards or table), and **My KPI**. Click a person to open their card.',
            'KPI পেজে ট্যাবগুলো ব্যবহার করুন: দলগত KPI (SBU-তে ক্লিক করলে তার Department খোলে), ব্যক্তিদের তালিকা (খোঁজা, সাজানো, কার্ড বা টেবিল) এবং **My KPI**। কারও কার্ড খুলতে তাঁর নামে ক্লিক করুন।'),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 9. Working well
  {
    id: 'habits', audience: 'all', title: t('9. Working well with the system', '৯. সিস্টেম ভালোভাবে ব্যবহার'),
    sections: [
      {
        id: 'routine', title: t('A simple routine', 'একটি সহজ রুটিন'),
        blocks: [
          h('Every day (5 minutes)', 'প্রতিদিন (৫ মিনিট)'),
          steps(
            t('Open **My Dashboard**; look at **Due Today**, **Overdue** and **Blocked**.', '**My Dashboard** খুলে **Due Today**, **Overdue** ও **Blocked** দেখুন।'),
            t('Open **Approvals** and decide what waits for you.', '**Approvals** খুলে আপনার অপেক্ষায় থাকা অনুরোধে সিদ্ধান্ত দিন।'),
            t('Read **Notifications** and reply to comments.', '**Notifications** পড়ুন এবং মন্তব্যের উত্তর দিন।'),
          ),
          h('Every week', 'প্রতি সপ্তাহে'),
          steps(
            t('Update progress on every open task of yours.', 'আপনার প্রতিটি চলমান টাস্কের অগ্রগতি আপডেট করুন।'),
            t('For tasks that will be late: log the delay and request a date revision.', 'যে টাস্ক দেরি হবে: Delay লিখুন এবং তারিখ পরিবর্তনের অনুরোধ করুন।'),
            t('Submit finished tasks for completion.', 'শেষ হওয়া টাস্ক Submit for Completion করুন।'),
            t('Managers: open the **KPI** page and look at your team; open the projects you manage and read **Schedule Impact**.', 'ম্যানেজাররা: **KPI** পেজ খুলে দলের অবস্থা দেখুন; আপনার প্রজেক্ট খুলে **Schedule Impact** পড়ুন।'),
          ),
        ],
      },
      {
        id: 'faq', title: t('Common problems', 'সাধারণ সমস্যা'),
        blocks: [
          table(
            [t('Problem', 'সমস্যা'), t('What to do', 'করণীয়')],
            [t('I cannot log in.', 'লগইন করতে পারছি না।'), t('Check the email / Employee ID and password. After 5 wrong tries wait 15 minutes, or use Forgot Password. If you were invited, finish Sign Up first. If it still fails, your account may be deactivated - ask an admin.', 'ইমেইল / Employee ID ও পাসওয়ার্ড যাচাই করুন। ৫ বার ভুল হলে ১৫ মিনিট অপেক্ষা করুন, অথবা Forgot Password ব্যবহার করুন। আমন্ত্রণ পেয়ে থাকলে আগে Sign Up শেষ করুন। তবুও না হলে অ্যাকাউন্ট নিষ্ক্রিয় থাকতে পারে — অ্যাডমিনকে জানান।')],
            [t('I cannot see a project or task.', 'কোনো প্রজেক্ট বা টাস্ক দেখতে পাচ্ছি না।'), t('You see only what you are on. Ask the Project Manager to add you to a task or as an associated person.', 'আপনি শুধু যেখানে যুক্ত আছেন তা দেখেন। Project Manager-কে বলুন আপনাকে কোনো টাস্কে বা সংশ্লিষ্ট ব্যক্তি হিসেবে যোগ করতে।')],
            [t('I cannot edit a task.', 'টাস্ক এডিট করতে পারছি না।'), t('Only its Responsible and Accountable (and admin / privileged roles) can. A Reviewer or Informed person cannot.', 'শুধু Responsible ও Accountable (এবং অ্যাডমিন / প্রিভিলেজড রোল) পারেন। Reviewer বা Informed পারেন না।')],
            [t('I cannot set the status to Completed.', 'স্ট্যাটাস Completed করতে পারছি না।'), t('Use **Submit for Completion**; the task is completed when it is approved.', '**Submit for Completion** ব্যবহার করুন; অনুমোদিত হলে টাস্ক সম্পন্ন হয়।')],
            [t('The due date field is locked.', 'শেষ তারিখের ঘর লক করা।'), t('Use **Request Date Revision** on the task page.', 'টাস্ক পেজে **Request Date Revision** ব্যবহার করুন।')],
            [t('"This task has no reviewer."', '"This task has no reviewer."'), t('A date revision needs a Reviewer. Ask the Responsible person or an admin to set one.', 'তারিখ পরিবর্তনের জন্য Reviewer লাগে। Responsible ব্যক্তি বা অ্যাডমিনকে Reviewer দিতে বলুন।')],
            [t('The button shows "✓ Submitted" and I cannot submit again.', 'বাটনে "✓ Submitted" দেখাচ্ছে, আবার সাবমিট করা যাচ্ছে না।'), t('A request is pending, or it was rejected. After a rejection, save a new progress update, then submit again.', 'একটি অনুরোধ অপেক্ষমাণ, অথবা প্রত্যাখ্যাত হয়েছে। প্রত্যাখ্যানের পর নতুন করে অগ্রগতি আপডেট সেভ করে আবার সাবমিট করুন।')],
            [t('My approval request is not being decided.', 'আমার অনুরোধে সিদ্ধান্ত আসছে না।'), t('Open **Approvals** to see who it is with and remind them. An admin or the SBU\'s COO can also decide it.', '**Approvals** খুলে দেখুন এটি কার কাছে আছে এবং তাঁকে মনে করিয়ে দিন। অ্যাডমিন বা SBU-এর COO-ও সিদ্ধান্ত দিতে পারেন।')],
            [t('A person is not in the list.', 'কোনো ব্যক্তি তালিকায় নেই।'), t('Choose **+ new user** in the person field, enter their email and they are invited.', 'ব্যক্তির ঘরে **+ new user** বেছে তাঁর ইমেইল দিন — তাঁকে আমন্ত্রণ পাঠানো হবে।')],
            [t('My KPI looks too low.', 'আমার KPI অনেক কম দেখাচ্ছে।'), t('Open **KPI → See the projects and tasks behind it**. Look for tasks with old progress, tasks past due, and tasks completed late.', '**KPI → See the projects and tasks behind it** খুলুন। পুরোনো অগ্রগতির টাস্ক, মেয়াদোত্তীর্ণ টাস্ক ও দেরিতে সম্পন্ন টাস্ক খুঁজুন।')],
            [t('I did not get an email.', 'ইমেইল পাইনি।'), t('Check the spam folder. Approvals are shown only inside the system, under Notifications.', 'স্প্যাম ফোল্ডার দেখুন। অনুমোদনের বার্তা শুধু সিস্টেমের ভেতরে Notifications-এ আসে।')],
          ),
        ],
      },
    ],
  },
]

export const GUIDE: Chapter[] = [...USER_GUIDE, ...ADMIN_GUIDE]
