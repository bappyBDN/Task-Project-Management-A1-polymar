import { Chapter, h, info, list, p, steps, t, table, tip, warn } from './types'

// The admin part of the User Guide: shown to admin and the privileged roles only
// (pages/Guide.tsx), and first in the Admin Panel's "User Guide" tab.

export const ADMIN_GUIDE: Chapter[] = [
  {
    id: 'admin-roles', audience: 'admin', title: t('A1. Admin and privileged roles', 'A1. অ্যাডমিন ও প্রিভিলেজড রোল'),
    sections: [
      {
        id: 'admin-vs-priv', title: t('What each can do', 'কে কী করতে পারেন'),
        lead: t('A privileged role sees and edits everything, but the Admin Panel and the permanent actions stay with the admin.',
          'প্রিভিলেজড রোল সবকিছু দেখতে ও এডিট করতে পারে, কিন্তু Admin Panel ও স্থায়ী কাজগুলো অ্যাডমিনের হাতেই থাকে।'),
        blocks: [
          table(
            [t('Action', 'কাজ'), t('Admin', 'অ্যাডমিন'), t('Privileged role', 'প্রিভিলেজড রোল'), t('COO (own SBUs)', 'COO (নিজের SBU)')],
            [t('See every project and task', 'সব প্রজেক্ট ও টাস্ক দেখা'), t('Yes', 'হ্যাঁ'), t('Yes', 'হ্যাঁ'), t('Yes, in their SBUs', 'হ্যাঁ, নিজের SBU-তে')],
            [t('Edit every field of a task or project', 'টাস্ক বা প্রজেক্টের সব ঘর এডিট'), t('Yes', 'হ্যাঁ'), t('Yes', 'হ্যাঁ'), t('Yes, in their SBUs', 'হ্যাঁ, নিজের SBU-তে')],
            [t('Set a task to Completed directly', 'সরাসরি টাস্ক Completed করা'), t('Yes', 'হ্যাঁ'), t('Yes', 'হ্যাঁ'), t('Yes, in their SBUs', 'হ্যাঁ, নিজের SBU-তে')],
            [t('Decide any approval request', 'যেকোনো অনুমোদনের সিদ্ধান্ত'), t('Yes', 'হ্যাঁ'), t('Only when they are the approver, Reviewer or Accountable', 'শুধু তিনি অনুমোদনকারী, Reviewer বা Accountable হলে'), t('Yes, in their SBUs', 'হ্যাঁ, নিজের SBU-তে')],
            [t('See everyone\'s KPI', 'সবার KPI দেখা'), t('Yes', 'হ্যাঁ'), t('Yes', 'হ্যাঁ'), t('Their SBUs', 'নিজের SBU')],
            [t('Tasks page (all tasks in one list)', 'Tasks পেজ (সব টাস্ক এক তালিকায়)'), t('Yes', 'হ্যাঁ'), t('No', 'না'), t('No', 'না')],
            [t('Admin Panel', 'Admin Panel'), t('Yes', 'হ্যাঁ'), t('No', 'না'), t('No', 'না')],
            [t('Create, edit, deactivate, remove users; give roles', 'ইউজার তৈরি, এডিট, নিষ্ক্রিয়, বাদ; রোল দেওয়া'), t('Yes', 'হ্যাঁ'), t('No', 'না'), t('No', 'না')],
            [t('Choose which roles are privileged', 'কোন রোল প্রিভিলেজড তা ঠিক করা'), t('Yes', 'হ্যাঁ'), t('No', 'না'), t('No', 'না')],
            [t('Delete a project', 'প্রজেক্ট মুছে ফেলা'), t('Yes', 'হ্যাঁ'), t('Only as its Project Manager', 'শুধু তার Project Manager হলে'), t('Only as its Project Manager', 'শুধু তার Project Manager হলে')],
            [t('Merge duplicate SBUs / functions / departments', 'ডুপ্লিকেট SBU / Function / Department একত্র করা'), t('Yes', 'হ্যাঁ'), t('No', 'না'), t('No', 'না')],
            [t('See other people\'s notifications; email log', 'অন্যের নোটিফিকেশন; ইমেইল লগ দেখা'), t('Yes', 'হ্যাঁ'), t('No', 'না'), t('No', 'না')],
            [t('Decide a methodology approval slot', 'Methodology অনুমোদনের সিদ্ধান্ত'), t('Only the assigned approver', 'শুধু নির্ধারিত অনুমোদনকারী'), t('Only the assigned approver', 'শুধু নির্ধারিত অনুমোদনকারী'), t('Only the assigned approver', 'শুধু নির্ধারিত অনুমোদনকারী')],
          ),
          info('The privileged roles use the same menu as everyone else; they simply see all the data in it. They read this admin chapter in the User Guide.',
            'প্রিভিলেজড রোল অন্য সবার মতো একই মেনু ব্যবহার করে; শুধু তাতে সব ডেটা দেখতে পায়। তারা User Guide-এ এই অ্যাডমিন অধ্যায়টি পড়তে পারে।'),
        ],
      },
      {
        id: 'priv-set', title: t('Choose the privileged roles', 'প্রিভিলেজড রোল ঠিক করা'),
        blocks: [
          steps(
            t('Open **Admin Panel → Privileged Roles**.', '**Admin Panel → Privileged Roles** খুলুন।'),
            t('Add a role from the list, or remove one. **admin** cannot be removed.', 'তালিকা থেকে রোল যোগ করুন বা বাদ দিন। **admin** বাদ দেওয়া যায় না।'),
            t('The change applies to everyone with that role at once.', 'পরিবর্তনটি ওই রোলের সবার জন্য সাথে সাথে কার্যকর হয়।'),
          ),
          warn('Keep this list short. Everyone with a privileged role can edit and complete any task in the group.',
            'এই তালিকা ছোট রাখুন। প্রিভিলেজড রোলের প্রত্যেকে গ্রুপের যেকোনো টাস্ক এডিট ও সম্পন্ন করতে পারেন।'),
        ],
      },
    ],
  },
  {
    id: 'admin-users', audience: 'admin', title: t('A2. Managing users', 'A2. ইউজার ব্যবস্থাপনা'),
    sections: [
      {
        id: 'user-add', title: t('Add a user', 'ইউজার যোগ করা'),
        lead: t('Three ways. In all of them the person can be given tasks immediately.', 'তিনটি উপায় আছে। সবগুলোতেই ব্যক্তিকে সাথে সাথে টাস্ক দেওয়া যায়।'),
        blocks: [
          table(
            [t('Way', 'উপায়'), t('Where', 'কোথায়'), t('What happens', 'যা ঘটে')],
            [t('**+ New User**', '**+ New User**'), t('Admin Panel → Users', 'Admin Panel → Users'), t('You enter Employee ID, Name, Email, Designation, SBU(s), Function, Department, Reports To and Role. The person is emailed a link to set their password (valid 24 hours).', 'আপনি Employee ID, Name, Email, Designation, SBU, Function, Department, Reports To ও Role দেন। ব্যক্তি পাসওয়ার্ড সেট করার লিংকসহ ইমেইল পান (২৪ ঘণ্টা কার্যকর)।')],
            [t('**Invite User**', '**Invite User**'), t('Admin Panel → Users, and "+ new user" in any person field', 'Admin Panel → Users, এবং যেকোনো ব্যক্তির ঘরে "+ new user"'), t('You enter only an email. The person gets a Sign Up link and fills in the rest themselves. Until then they show as **Invited**.', 'আপনি শুধু ইমেইল দেন। ব্যক্তি Sign Up লিংক পান এবং বাকিটা নিজে পূরণ করেন। ততক্ষণ তাঁকে **Invited** দেখায়।')],
            [t('**Self sign-up**', '**নিজে Sign Up**'), t('The Sign Up page', 'Sign Up পেজ'), t('The person registers and is active at once with the role Employee. Check their SBU, department, manager and role afterwards.', 'ব্যক্তি নিজে নিবন্ধন করেন এবং Employee রোলে সাথে সাথে সক্রিয় হন। পরে তাঁর SBU, Department, ম্যানেজার ও রোল যাচাই করুন।')],
          ),
          list(
            t('**Resend Invite** on an Invited row sends the link again.', 'Invited সারিতে **Resend Invite** দিলে লিংক আবার পাঠানো হয়।'),
            t('If the email could not be sent, the person is still saved. Ask them to open Sign Up and register with that email.', 'ইমেইল পাঠানো না গেলেও ব্যক্তি সেভ থাকেন। তাঁকে Sign Up খুলে ওই ইমেইল দিয়ে নিবন্ধন করতে বলুন।'),
            t('An email or Employee ID that already exists is refused.', 'আগে থেকে থাকা ইমেইল বা Employee ID গ্রহণ করা হয় না।'),
            t('The first SBU you pick is the person\'s main SBU; add more if they work for several.', 'প্রথমে বাছা SBU ব্যক্তির প্রধান SBU; একাধিক SBU-তে কাজ করলে আরও যোগ করুন।'),
            t('In the SBU, Function and Department fields you can create a new entry with **+ new**.', 'SBU, Function ও Department ঘরে **+ new** দিয়ে নতুন নাম তৈরি করা যায়।'),
          ),
        ],
      },
      {
        id: 'user-edit', title: t('Edit, deactivate and remove', 'এডিট, নিষ্ক্রিয় ও বাদ দেওয়া'),
        blocks: [
          list(
            t('**Search** the Users list by name, ID, email, designation, role, SBU, or the words active / invited / inactive.', 'Users তালিকায় নাম, ID, ইমেইল, পদবি, রোল, SBU অথবা active / invited / inactive শব্দ দিয়ে **খুঁজুন**।'),
            t('**Edit** changes any field, including Employee ID, Email and Role.', '**Edit** দিয়ে যেকোনো ঘর বদলানো যায় — Employee ID, Email ও Role-সহ।'),
            t('**Deactivate** (click twice): the person can no longer log in, gets no emails and is not offered in the person lists. Their tasks and history stay. **Activate** reverses it.', '**Deactivate** (দুবার ক্লিক): ব্যক্তি আর লগইন করতে পারেন না, ইমেইল পান না এবং ব্যক্তির তালিকায় আসেন না। তাঁর টাস্ক ও ইতিহাস থেকে যায়। **Activate** দিলে আবার সক্রিয় হন।'),
            t('**Remove** deletes the user permanently. Their tasks and projects are kept, but their name is taken off them (Responsible, Accountable, Reviewer, Informed, Manager, Owner become empty) and their notifications are deleted.', '**Remove** ইউজারকে স্থায়ীভাবে মুছে ফেলে। তাঁর টাস্ক ও প্রজেক্ট থাকে, কিন্তু সেগুলো থেকে তাঁর নাম সরে যায় (Responsible, Accountable, Reviewer, Informed, Manager, Owner খালি হয়) এবং তাঁর নোটিফিকেশন মুছে যায়।'),
            t('An admin account cannot be deactivated or removed from this list.', 'এই তালিকা থেকে অ্যাডমিন অ্যাকাউন্ট নিষ্ক্রিয় বা বাদ দেওয়া যায় না।'),
          ),
          warn('When someone leaves, **Deactivate** them - do not Remove. Then reassign their open tasks to someone else. Remove leaves tasks with no owner and cannot be undone.',
            'কেউ চলে গেলে তাঁকে **Deactivate** করুন — Remove নয়। তারপর তাঁর চলমান টাস্ক অন্যকে দিন। Remove করলে টাস্কের দায়িত্বপ্রাপ্ত কেউ থাকে না এবং এটি ফেরানো যায় না।'),
          tip('A user who forgot their password uses **Forgot Password** themselves; an admin does not set passwords.',
            'পাসওয়ার্ড ভুলে গেলে ইউজার নিজে **Forgot Password** ব্যবহার করেন; অ্যাডমিন পাসওয়ার্ড সেট করেন না।'),
        ],
      },
      {
        id: 'head-roles', title: t('Set up heads and the COO', 'হেড ও COO সেট করা'),
        lead: t('A head role only works when the matching fields on the person\'s record are filled.', 'ব্যক্তির রেকর্ডে সংশ্লিষ্ট ঘরগুলো পূরণ থাকলেই হেড রোল কাজ করে।'),
        blocks: [
          table(
            [t('Role', 'রোল'), t('Fill in', 'যা পূরণ করবেন'), t('They then see and get', 'এরপর তাঁরা যা দেখেন')],
            [t('**Department Head**', '**Department Head**'), t('SBU + Department', 'SBU + Department'), t('Every task of that department in that SBU; the KPI of its people.', 'ওই SBU-এর ওই Department-এর সব টাস্ক; সেখানকার সবার KPI।')],
            [t('**Functional Head**', '**Functional Head**'), t('SBU + Function', 'SBU + Function'), t('Every project and task of that function in that SBU; the KPI of its people.', 'ওই SBU-এর ওই Function-এর সব প্রজেক্ট ও টাস্ক; সেখানকার সবার KPI।')],
            [t('**Business Head**', '**Business Head**'), t('SBU (all SBUs on the record count)', 'SBU (রেকর্ডের সব SBU গণনা হয়)'), t('Every project and task of the SBU; the KPI of everyone in it.', 'SBU-এর সব প্রজেক্ট ও টাস্ক; সেখানকার সবার KPI।')],
            [t('**COO**', '**COO**'), t('**SBUs overseen** (a separate list that appears when the role is COO; at least one)', '**SBUs overseen** (রোল COO হলে আলাদা তালিকা আসে; অন্তত একটি)'), t('Everything in those SBUs, with full edit and approval rights there.', 'ওই SBU-গুলোর সবকিছু, সেখানে পূর্ণ এডিট ও অনুমোদনের অধিকারসহ।')],
          ),
          list(
            t('A head with an empty SBU (or empty function / department) heads nothing and sees only their own work.', 'SBU (বা Function / Department) খালি থাকলে হেড কোনো কিছুর প্রধান নন এবং শুধু নিজের কাজ দেখেন।'),
            t('Head roles can only be given by an admin, and a head cannot change their own SBU, function or department.', 'হেড রোল শুধু অ্যাডমিন দিতে পারেন, এবং হেড নিজের SBU, Function বা Department বদলাতে পারেন না।'),
            t('For the COO, "SBUs overseen" is not the same as the SBU field: the SBU field is where they belong, the list is what they oversee.', 'COO-এর ক্ষেত্রে "SBUs overseen" ও SBU ঘর এক নয়: SBU ঘর হলো তিনি কোথাকার, আর তালিকাটি হলো তিনি কী তত্ত্বাবধান করেন।'),
          ),
        ],
      },
      {
        id: 'hierarchy', title: t('Reporting line (Hierarchy Mapping)', 'রিপোর্টিং লাইন (Hierarchy Mapping)'),
        blocks: [
          list(
            t('**Admin Panel → Hierarchy Mapping** draws the organisation chart from each person\'s **Reports To**, with a table showing the full chain.', '**Admin Panel → Hierarchy Mapping** প্রত্যেকের **Reports To** থেকে সংগঠনের চার্ট আঁকে, সাথে পূর্ণ ধারাবাহিকতার টেবিল।'),
            t('Click **Edit** on a row to change who the person reports to.', 'কে কাকে রিপোর্ট করেন তা বদলাতে সারিতে **Edit**-এ ক্লিক করুন।'),
            t('A warning shows when users report to someone who no longer exists - fix those first.', 'কোনো ইউজার এমন কাউকে রিপোর্ট করলে যিনি আর নেই, সতর্কবার্তা দেখায় — আগে সেগুলো ঠিক করুন।'),
          ),
          p('Reports To matters in three places: the manager is suggested as **Accountable** on the person\'s tasks; the manager becomes the completion approver when a task has no Reviewer and no Accountable; and the manager sees the person\'s **KPI**.',
            'Reports To তিন জায়গায় গুরুত্বপূর্ণ: ব্যক্তির টাস্কে ম্যানেজারকে **Accountable** হিসেবে প্রস্তাব করা হয়; টাস্কে Reviewer ও Accountable না থাকলে ম্যানেজার সম্পন্ন করার অনুমোদনকারী হন; এবং ম্যানেজার ওই ব্যক্তির **KPI** দেখেন।'),
        ],
      },
    ],
  },
  {
    id: 'admin-panel', audience: 'admin', title: t('A3. The rest of the Admin Panel', 'A3. Admin Panel-এর অন্যান্য অংশ'),
    sections: [
      {
        id: 'panel-tabs', title: t('The tabs', 'ট্যাবগুলো'),
        blocks: [
          table(
            [t('Tab', 'ট্যাব'), t('Use it to', 'যে কাজে')],
            [t('Users', 'Users'), t('Add, invite, edit, deactivate, activate and remove users; give roles.', 'ইউজার যোগ, আমন্ত্রণ, এডিট, নিষ্ক্রিয়, সক্রিয় ও বাদ দেওয়া; রোল দেওয়া।')],
            [t('All Tasks', 'All Tasks'), t('See every task; **Remove** deletes one permanently (after a confirmation).', 'সব টাস্ক দেখা; **Remove** দিলে (নিশ্চিত করার পর) স্থায়ীভাবে মুছে যায়।')],
            [t('Privileged Roles', 'Privileged Roles'), t('Choose which roles see and edit everything.', 'কোন রোল সবকিছু দেখবে ও এডিট করবে তা ঠিক করা।')],
            [t('Hierarchy Mapping', 'Hierarchy Mapping'), t('Check and correct who reports to whom.', 'কে কাকে রিপোর্ট করেন তা যাচাই ও সংশোধন।')],
            [t('System Emails', 'System Emails'), t('Read the log of the automatic emails: type, subject, recipients and when (the newest 500).', 'স্বয়ংক্রিয় ইমেইলের লগ দেখা: ধরন, বিষয়, প্রাপক ও সময় (সর্বশেষ ৫০০টি)।')],
            [t('Duplicates', 'Duplicates'), t('Find and merge SBUs, functions and departments entered twice.', 'দুবার লেখা SBU, Function ও Department খুঁজে একত্র করা।')],
            [t('User Guide', 'User Guide'), t('This guide, with the admin chapters first.', 'এই নির্দেশিকা — অ্যাডমিন অধ্যায়গুলো আগে।')],
          ),
        ],
      },
      {
        id: 'duplicates', title: t('Clean up duplicates', 'ডুপ্লিকেট পরিষ্কার করা'),
        lead: t('A duplicate is the same SBU, function or department entered more than once - the same name ignoring capitals, spaces and "Ltd".',
          'ডুপ্লিকেট হলো একই SBU, Function বা Department একাধিকবার লেখা — বড়-ছোট হাতের অক্ষর, ফাঁকা জায়গা ও "Ltd" বাদ দিলে একই নাম।'),
        blocks: [
          steps(
            t('Open **Admin Panel → Duplicates**.', '**Admin Panel → Duplicates** খুলুন।'),
            t('For a function or department, choose which copy to keep (the most used one is suggested) and click **Merge**.', 'Function বা Department-এর ক্ষেত্রে কোন কপিটি রাখবেন তা বাছুন (সবচেয়ে বেশি ব্যবহৃতটি প্রস্তাব করা হয়) এবং **Merge**-এ ক্লিক করুন।'),
            t('All tasks, projects and users move to the kept copy and the extra copies are deleted, in one step.', 'সব টাস্ক, প্রজেক্ট ও ইউজার রাখা কপিতে চলে যায় এবং বাড়তি কপিগুলো এক ধাপে মুছে যায়।'),
          ),
          list(
            t('No task, project or user is ever deleted by a merge.', 'Merge করলে কোনো টাস্ক, প্রজেক্ট বা ইউজার মুছে যায় না।'),
            t('For SBUs the kept copy is fixed (the one the lists use); records are moved to it, and the emptied copy stays in the list.', 'SBU-এর ক্ষেত্রে রাখা কপিটি নির্দিষ্ট (যেটি তালিকায় ব্যবহৃত হয়); রেকর্ডগুলো সেখানে সরানো হয়, আর খালি কপিটি তালিকায় থেকে যায়।'),
            t('A function or department that is still used cannot be deleted; the message tells you how many tasks and users use it. Merge it into another one instead.', 'ব্যবহৃত Function বা Department মুছে ফেলা যায় না; বার্তায় দেখায় কতটি টাস্ক ও ইউজার এটি ব্যবহার করছে। বরং অন্যটির সাথে Merge করুন।'),
          ),
          tip('Check Duplicates once a month. Duplicates split a department\'s people and tasks across two names in filters and reports.',
            'মাসে একবার Duplicates দেখুন। ডুপ্লিকেট থাকলে ফিল্টার ও রিপোর্টে একটি Department-এর ব্যক্তি ও টাস্ক দুই নামে ভাগ হয়ে যায়।'),
        ],
      },
      {
        id: 'admin-emails', title: t('Emails the system sends', 'সিস্টেম যে ইমেইল পাঠায়'),
        blocks: [
          list(
            t('**Every hour** the system checks and emails: tasks due within 3 days or overdue (once a day per task), tasks just completed, and backlog items open 7 days or more.', '**প্রতি ঘণ্টায়** সিস্টেম যাচাই করে ইমেইল পাঠায়: ৩ দিনের মধ্যে মেয়াদ বা মেয়াদোত্তীর্ণ টাস্ক (প্রতি টাস্কে দিনে একবার), সদ্য সম্পন্ন টাস্ক এবং ৭ দিন বা বেশি পড়ে থাকা Backlog আইটেম।'),
            t('**At once:** invitations, set-password and reset-password links, comments and replies, meeting invitations, methodology requests and decisions.', '**সাথে সাথে:** আমন্ত্রণ, পাসওয়ার্ড সেট ও রিসেটের লিংক, মন্তব্য ও উত্তর, মিটিংয়ের আমন্ত্রণ, Methodology অনুরোধ ও সিদ্ধান্ত।'),
            t('**Never by email:** approval requests and their results - these are notifications inside the system only.', '**ইমেইলে কখনো নয়:** অনুমোদনের অনুরোধ ও ফলাফল — এগুলো শুধু সিস্টেমের ভেতরের নোটিফিকেশন।'),
            t('Deactivated users get no emails.', 'নিষ্ক্রিয় ইউজার কোনো ইমেইল পান না।'),
          ),
          p('If someone says they got no email, look in **System Emails** for the scheduled ones, and ask them to check their spam folder. For an invitation, use **Resend Invite**.',
            'কেউ ইমেইল পাননি বললে নির্ধারিত ইমেইলের জন্য **System Emails** দেখুন এবং তাঁকে স্প্যাম ফোল্ডার দেখতে বলুন। আমন্ত্রণের ক্ষেত্রে **Resend Invite** ব্যবহার করুন।'),
        ],
      },
    ],
  },
  {
    id: 'admin-care', audience: 'admin', title: t('A4. Keeping the system healthy', 'A4. সিস্টেম সুস্থ রাখা'),
    sections: [
      {
        id: 'admin-setup', title: t('Checklist: a new SBU or team starts using the system', 'চেকলিস্ট: নতুন SBU বা দল সিস্টেম ব্যবহার শুরু করলে'),
        blocks: [
          steps(
            t('Make sure the SBU, its functions and departments exist once, with the right spelling.', 'SBU, তার Function ও Department সঠিক বানানে একবারই আছে কি না নিশ্চিত করুন।'),
            t('Add or invite the people; check each one\'s SBU, function, department and **Reports To**.', 'ব্যক্তিদের যোগ বা আমন্ত্রণ করুন; প্রত্যেকের SBU, Function, Department ও **Reports To** যাচাই করুন।'),
            t('Give the head roles (Department Head, Functional Head, Business Head) and the COO\'s **SBUs overseen**.', 'হেড রোল (Department Head, Functional Head, Business Head) এবং COO-এর **SBUs overseen** দিন।'),
            t('Open **Hierarchy Mapping** and confirm the chart looks like the real organisation.', '**Hierarchy Mapping** খুলে নিশ্চিত করুন চার্টটি প্রকৃত সংগঠনের মতো।'),
            t('Ask each Project Manager to create their projects with tasks, a Reviewer on every task, and realistic dates.', 'প্রত্যেক Project Manager-কে বলুন টাস্কসহ প্রজেক্ট তৈরি করতে — প্রতিটি টাস্কে Reviewer ও বাস্তবসম্মত তারিখ দিয়ে।'),
            t('Share this User Guide with the team.', 'দলের সাথে এই User Guide শেয়ার করুন।'),
          ),
        ],
      },
      {
        id: 'admin-monthly', title: t('Checklist: every month', 'চেকলিস্ট: প্রতি মাসে'),
        blocks: [
          list(
            t('**Users:** search "invited" and resend or remove invitations nobody used; deactivate people who left and reassign their tasks.', '**Users:** "invited" লিখে খুঁজুন এবং অব্যবহৃত আমন্ত্রণ আবার পাঠান বা বাদ দিন; চলে যাওয়া ব্যক্তিদের নিষ্ক্রিয় করে তাঁদের টাস্ক অন্যকে দিন।'),
            t('**Hierarchy Mapping:** fix anyone reporting to a person who no longer exists.', '**Hierarchy Mapping:** যিনি আর নেই তাঁকে কেউ রিপোর্ট করলে তা ঠিক করুন।'),
            t('**Duplicates:** merge what was entered twice.', '**Duplicates:** দুবার লেখা নামগুলো একত্র করুন।'),
            t('**RACI Matrix:** look at the gaps banner - tasks without a Responsible or Accountable.', '**RACI Matrix:** ঘাটতির ব্যানার দেখুন — Responsible বা Accountable ছাড়া টাস্ক।'),
            t('**Approvals:** look for requests pending a long time and decide them or remind the approver.', '**Approvals:** দীর্ঘদিন অপেক্ষমাণ অনুরোধ খুঁজে সিদ্ধান্ত দিন বা অনুমোদনকারীকে মনে করিয়ে দিন।'),
            t('**KPI:** open "Need attention" and "Nothing to score yet" - people with no score usually have no tasks or tasks without dates.', '**KPI:** "Need attention" ও "Nothing to score yet" খুলুন — স্কোর না থাকা ব্যক্তিদের সাধারণত টাস্ক নেই বা টাস্কে তারিখ নেই।'),
            t('**Audit Trail:** review deletions and role changes.', '**Audit Trail:** মুছে ফেলা ও রোল পরিবর্তনগুলো পর্যালোচনা করুন।'),
          ),
        ],
      },
      {
        id: 'admin-careful', title: t('Actions that cannot be undone', 'যে কাজগুলো ফেরানো যায় না'),
        blocks: [
          table(
            [t('Action', 'কাজ'), t('What is lost', 'যা হারিয়ে যায়'), t('Safer choice', 'নিরাপদ বিকল্প')],
            [t('Remove a user', 'ইউজার Remove'), t('Their name on every task and project, and their notifications', 'সব টাস্ক ও প্রজেক্ট থেকে তাঁর নাম এবং তাঁর নোটিফিকেশন'), t('Deactivate', 'Deactivate করুন')],
            [t('Remove a task (All Tasks) or approve a task deletion', 'টাস্ক Remove (All Tasks) বা টাস্ক মুছে ফেলার অনুমোদন'), t('The task with its progress history, delays and approvals', 'টাস্ক ও তার অগ্রগতির ইতিহাস, Delay ও অনুমোদন'), t('Set the status to Cancelled', 'স্ট্যাটাস Cancelled করুন')],
            [t('Delete a project', 'প্রজেক্ট মুছে ফেলা'), t('The project and all its tasks, with their history', 'প্রজেক্ট ও তার সব টাস্ক, ইতিহাসসহ'), t('Set the project status to Cancelled or Closed', 'প্রজেক্টের স্ট্যাটাস Cancelled বা Closed করুন')],
            [t('Merge duplicates', 'ডুপ্লিকেট Merge'), t('The extra copy of the name (no records are lost)', 'নামের বাড়তি কপি (কোনো রেকর্ড হারায় না)'), t('Check which copy you keep before merging', 'Merge-এর আগে দেখে নিন কোন কপি রাখছেন')],
          ),
          h('Before deleting anything', 'কিছু মোছার আগে'),
          p('Ask whether a status change would do. Cancelled tasks and projects stay in the records and the Audit Trail, and are left out of the KPI.',
            'ভেবে দেখুন স্ট্যাটাস বদলালেই চলে কি না। Cancelled টাস্ক ও প্রজেক্ট রেকর্ড ও Audit Trail-এ থেকে যায় এবং KPI-তে গণনা হয় না।'),
        ],
      },
    ],
  },
]
