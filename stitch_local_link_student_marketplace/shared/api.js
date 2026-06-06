// ============================================================
// Supabase config — replace with your project values
// ============================================================
const SUPABASE_URL = 'https://evksghzxchkkoxwvzmiv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2a3NnaHp4Y2hra294d3Z6bWl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MDYwNDEsImV4cCI6MjA5NTQ4MjA0MX0.nhnfiNOb4_L9NKvkCbB4yQjrpEmSyw8EfRyiV7a5DtA';
const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// Local Link API — Supabase-backed, same interface as before
// ============================================================
const api = {

  // ── Session helpers (synchronous — same as before) ─────────

  getToken: () => localStorage.getItem('ll_token'),
  getUser: () => {
    const u = localStorage.getItem('ll_user');
    return u ? JSON.parse(u) : null;
  },
  setAuth: (token, user) => {
    localStorage.setItem('ll_token', token);
    localStorage.setItem('ll_user', JSON.stringify(user));
  },
  clearAuth: () => {
    localStorage.removeItem('ll_token');
    localStorage.removeItem('ll_user');
    _sb.auth.signOut();
  },
  isLoggedIn: () => !!localStorage.getItem('ll_user'),
  headers: () => ({}),

  requireAuth: (role) => {
    const user = api.getUser();
    if (!user) { window.location.href = '/login_signup/code.html'; return false; }
    if (role && user.role !== role) { api.redirectByRole(user.role); return false; }
    return true;
  },

  redirectByRole: (role) => {
    if (role === 'admin') window.location.href = '/admin_control_center/code.html';
    else if (role === 'business') window.location.href = '/business_dashboard/code.html';
    else window.location.href = '/explore_student_businesses/code.html';
  },

  // ── Public interface (same as before) ─────────────────────

  async request(method, path, body, isFormData = false) {
    return api._route(method, path, body, isFormData);
  },
  get:      (path)       => api._route('GET',    path, null,  false),
  post:     (path, body) => api._route('POST',   path, body,  false),
  put:      (path, body) => api._route('PUT',    path, body,  false),
  delete:   (path)       => api._route('DELETE', path, null,  false),
  postForm: (path, fd)   => api._route('POST',   path, fd,    true),
  putForm:  (path, fd)   => api._route('PUT',    path, fd,    true),

  // ── Internal router ────────────────────────────────────────

  async _route(method, path, body, isFormData) {
    const [pathname, qs] = path.split('?');
    const query = {};
    if (qs) for (const [k, v] of new URLSearchParams(qs)) query[k] = v;

    // Auth
    if (method === 'POST' && pathname === '/auth/login')  return api._login(body);
    if (method === 'POST' && pathname === '/auth/signup') return api._signup(body);
    if (method === 'GET'  && pathname === '/auth/me')     return api._getMe();

    // Topics (before /businesses to catch /topics/me/subscriptions)
    if (pathname === '/topics/me/subscriptions')                        return api._getMySubscriptions();
    if (pathname === '/topics/subscribe' && method === 'POST')          return api._subscribe(body);
    const tLeads = pathname.match(/^\/topics\/(\w+)\/leads$/);
    if (tLeads  && method === 'GET')                                    return api._getTopicLeads(tLeads[1]);
    const tSub = pathname.match(/^\/topics\/(\w+)\/submit$/);
    if (tSub    && method === 'POST')                                   return api._submitTopic(tSub[1], body);
    if (pathname === '/topics' && method === 'GET')                     return api._getTopics();
    if (pathname === '/topics' && method === 'POST')                    return api._createTopic(body);
    const tMatch = pathname.match(/^\/topics\/(\w+)$/);
    if (tMatch  && method === 'GET')                                    return api._getTopic(tMatch[1]);
    if (tMatch  && method === 'PUT')                                    return api._updateTopic(tMatch[1], body);
    if (tMatch  && method === 'DELETE')                                 return api._deleteTopic(tMatch[1]);

    // Businesses
    if (pathname === '/businesses/me'         && method === 'GET')      return api._getMyBusiness();
    if (pathname === '/businesses/me'         && method === 'PUT')      return api._updateMyBusiness(body, isFormData);
    if (pathname === '/businesses/me/leads'   && method === 'GET')      return api._getLeads();
    if (pathname === '/businesses/verify'     && method === 'POST')     return api._requestVerification();
    const unlock = pathname.match(/^\/businesses\/me\/leads\/(\w+)\/unlock$/);
    if (unlock  && method === 'POST')                                   return api._unlockLead(unlock[1]);
    if (pathname === '/businesses'            && method === 'GET')      return api._getBusinesses(query);
    const bMatch = pathname.match(/^\/businesses\/(\w+)$/);
    if (bMatch  && method === 'GET')                                    return api._getBusiness(bMatch[1]);

    // Customers
    if (pathname === '/customers/interest'    && method === 'POST')     return api._submitInterest(body);
    if (pathname === '/customers/complaint'   && method === 'POST')     return api._submitComplaint(body);
    if (pathname === '/customers/me/activity' && method === 'GET')      return api._getCustomerActivity();

    // Admin
    if (pathname === '/admin/stats'           && method === 'GET')      return api._adminStats();
    if (pathname === '/admin/users'           && method === 'GET')      return api._adminUsers(query);
    if (pathname === '/admin/verifications'   && method === 'GET')      return api._adminVerifications();
    if (pathname === '/admin/complaints'      && method === 'GET')      return api._adminComplaints(query);
    if (pathname === '/admin/businesses'      && method === 'GET')      return api._adminBusinesses(query);
    const aUser = pathname.match(/^\/admin\/users\/(\w+)$/);
    if (aUser   && method === 'DELETE')                                 return api._adminDeleteUser(aUser[1]);
    const aApprove = pathname.match(/^\/admin\/verifications\/(\w+)\/approve$/);
    if (aApprove && method === 'POST')                                  return api._adminApproveVerification(aApprove[1]);
    const aReject = pathname.match(/^\/admin\/verifications\/(\w+)\/reject$/);
    if (aReject  && method === 'POST')                                  return api._adminRejectVerification(aReject[1], body);
    const aComp = pathname.match(/^\/admin\/complaints\/(\w+)$/);
    if (aComp   && method === 'PUT')                                    return api._adminUpdateComplaint(aComp[1], body);

    throw new Error(`Unhandled route: ${method} ${path}`);
  },

  _throw(error) {
    if (error) throw new Error(error.message || 'Database error');
  },

  // ── Auth ───────────────────────────────────────────────────

  async _login({ email, password }) {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password });
    api._throw(error);
    const { data: profile, error: pe } = await _sb.from('profiles').select('*').eq('id', data.user.id).single();
    api._throw(pe);
    const user = { id: data.user.id, email: data.user.email, role: profile.role, name: profile.name, phone: profile.phone };
    api.setAuth(data.session.access_token, user);
    return { token: data.session.access_token, user };
  },

  async _signup({ email, password, name, phone, role }) {
    const { data, error } = await _sb.auth.signUp({
      email, password,
      options: { data: { name, phone, role } }
    });
    api._throw(error);
    if (!data.user) throw new Error('Signup failed — check if email confirmation is required.');

    const { error: pe } = await _sb.from('profiles').insert({ id: data.user.id, email, name, phone: phone || null, role });
    api._throw(pe);

    if (role === 'business') {
      const { error: be } = await _sb.from('businesses').insert({ user_id: data.user.id, business_name: name, mission: '' });
      api._throw(be);
    }

    const user = { id: data.user.id, email, role, name, phone: phone || null };
    const token = data.session?.access_token || '';
    api.setAuth(token, user);
    return { token, user };
  },

  async _getMe() {
    const { data: { user }, error } = await _sb.auth.getUser();
    api._throw(error);
    const { data: profile, error: pe } = await _sb.from('profiles').select('*').eq('id', user.id).single();
    api._throw(pe);
    return profile;
  },

  // ── Businesses ─────────────────────────────────────────────

  async _getBusinesses({ category, search, verified } = {}) {
    let q = _sb.from('businesses').select('*, profiles(name, email)');
    if (category) q = q.eq('category', category);
    if (verified === 'true') q = q.eq('verified', 1);
    if (search) q = q.or(`business_name.ilike.%${search}%,mission.ilike.%${search}%`);
    q = q.order('verified', { ascending: false }).order('created_at', { ascending: false });
    const { data, error } = await q;
    api._throw(error);
    return data.map(b => ({ ...b, owner_name: b.profiles?.name, owner_email: b.profiles?.email }));
  },

  async _getBusiness(id) {
    const { data, error } = await _sb.from('businesses').select('*, profiles(name)').eq('id', id).single();
    api._throw(error);
    if (!data) throw new Error('Business not found');
    return { ...data, owner_name: data.profiles?.name };
  },

  async _getMyBusiness() {
    const user = api.getUser();
    const { data, error } = await _sb.from('businesses').select('*').eq('user_id', user.id).single();
    api._throw(error);
    if (!data) throw new Error('Business not found');
    return data;
  },

  async _updateMyBusiness(body, isFormData) {
    const user = api.getUser();
    const { data: biz } = await _sb.from('businesses').select('*').eq('user_id', user.id).single();
    let image_url = biz.image_url;

    let fields = body;
    if (isFormData) {
      fields = {};
      for (const [k, v] of body.entries()) fields[k] = v;
      const file = body.get('image');
      if (file && file.size > 0) {
        const ext = file.name.split('.').pop();
        const filePath = `${user.id}-${Date.now()}.${ext}`;
        const { error: ue } = await _sb.storage.from('business-images').upload(filePath, file, { upsert: true });
        api._throw(ue);
        const { data: urlData } = _sb.storage.from('business-images').getPublicUrl(filePath);
        image_url = urlData.publicUrl;
      }
    }

    const updates = {
      business_name: fields.business_name || biz.business_name,
      mission:  fields.mission  !== undefined ? fields.mission  : biz.mission,
      price:    fields.price    !== undefined ? fields.price    : biz.price,
      category: fields.category || biz.category,
      image_url
    };
    const { data, error } = await _sb.from('businesses').update(updates).eq('user_id', user.id).select().single();
    api._throw(error);
    return data;
  },

  async _requestVerification() {
    const user = api.getUser();
    const { data: biz } = await _sb.from('businesses').select('*').eq('user_id', user.id).single();
    if (!biz) throw new Error('Business not found');
    if (biz.verified) throw new Error('Already verified');
    if (biz.verification_status === 'pending') throw new Error('Verification already pending');

    const { error: ve } = await _sb.from('verification_requests').upsert(
      { business_id: biz.id, status: 'pending', payment_confirmed: 1 },
      { onConflict: 'business_id' }
    );
    api._throw(ve);
    await _sb.from('businesses').update({ verification_status: 'pending' }).eq('id', biz.id);
    await _sb.from('payments').insert({ user_id: user.id, amount: 10.00, type: 'verification', reference_id: biz.id });
    return { message: 'Verification request submitted. Admin will review your application.' };
  },

  async _getLeads() {
    const user = api.getUser();
    const { data: biz } = await _sb.from('businesses').select('*').eq('user_id', user.id).single();
    if (!biz) throw new Error('Business not found');
    const { data: forms, error } = await _sb.from('interest_forms')
      .select('id, customer_name, created_at, unlocked, customer_email, customer_phone, message')
      .eq('business_id', biz.id).order('created_at', { ascending: false });
    api._throw(error);
    const leads = forms.map(f => ({
      ...f,
      customer_email: f.unlocked ? f.customer_email : null,
      customer_phone: f.unlocked ? f.customer_phone : null,
      message:        f.unlocked ? f.message        : null,
    }));
    return { leads, free_leads_used: biz.free_leads_used, free_leads_limit: 5 };
  },

  async _unlockLead(leadId) {
    const user = api.getUser();
    const { data: biz } = await _sb.from('businesses').select('*').eq('user_id', user.id).single();
    const { data: lead } = await _sb.from('interest_forms').select('*').eq('id', leadId).eq('business_id', biz.id).single();
    if (!lead) throw new Error('Lead not found');
    if (lead.unlocked) throw new Error('Lead already unlocked');

    const isFree = biz.free_leads_used < 5;
    await _sb.from('interest_forms').update({ unlocked: 1 }).eq('id', leadId);
    await _sb.from('businesses').update({ free_leads_used: biz.free_leads_used + 1 }).eq('id', biz.id);
    if (!isFree) {
      await _sb.from('payments').insert({ user_id: user.id, amount: 1.99, type: 'lead_unlock', reference_id: lead.id });
    }
    const { data: unlocked } = await _sb.from('interest_forms').select('*').eq('id', leadId).single();
    return { message: isFree ? 'Lead unlocked (free)' : 'Lead unlocked ($1.99 charged)', lead: unlocked };
  },

  // ── Topics ─────────────────────────────────────────────────

  async _getTopics() {
    const { data, error } = await _sb.from('topics').select('*').order('name');
    api._throw(error);
    return data;
  },

  async _getTopic(id) {
    const { data, error } = await _sb.from('topics').select('*').eq('id', id).single();
    api._throw(error);
    return data;
  },

  async _createTopic({ name, description, icon }) {
    if (!name) throw new Error('Name is required');
    const { data, error } = await _sb.from('topics')
      .insert({ name, description: description || '', icon: icon || 'category' }).select().single();
    api._throw(error);
    return data;
  },

  async _updateTopic(id, { name, description, icon }) {
    const { data: topic } = await _sb.from('topics').select('*').eq('id', id).single();
    if (!topic) throw new Error('Topic not found');
    const { data, error } = await _sb.from('topics').update({
      name: name || topic.name,
      description: description !== undefined ? description : topic.description,
      icon: icon || topic.icon
    }).eq('id', id).select().single();
    api._throw(error);
    return data;
  },

  async _deleteTopic(id) {
    const { error } = await _sb.from('topics').delete().eq('id', id);
    api._throw(error);
    return { message: 'Topic deleted' };
  },

  async _submitTopic(topicId, { customer_name, customer_email, customer_phone, message }) {
    if (!customer_name || !customer_email) throw new Error('Name and email are required');
    const { data, error } = await _sb.from('topic_submissions').insert({
      topic_id: topicId, customer_name, customer_email,
      customer_phone: customer_phone || null, message: message || null
    }).select().single();
    api._throw(error);
    return { message: 'Submitted successfully', id: data.id };
  },

  async _getTopicLeads(topicId) {
    const user = api.getUser();
    const { data: biz } = await _sb.from('businesses').select('id').eq('user_id', user.id).single();
    if (!biz) throw new Error('Business not found');
    const { data: sub } = await _sb.from('topic_subscriptions')
      .select('id').eq('business_id', biz.id).eq('topic_id', topicId).eq('active', 1).single();
    if (!sub) throw new Error('Not subscribed to this topic');
    const { data, error } = await _sb.from('topic_submissions').select('*')
      .eq('topic_id', topicId).order('created_at', { ascending: false });
    api._throw(error);
    return data;
  },

  async _subscribe({ topic_ids, plan_type }) {
    if (!topic_ids || !plan_type) throw new Error('topic_ids and plan_type are required');
    if (!['single', 'bundle'].includes(plan_type)) throw new Error('Invalid plan_type');
    if (plan_type === 'single' && topic_ids.length !== 1) throw new Error('Single plan requires exactly 1 topic');
    if (plan_type === 'bundle' && topic_ids.length !== 3) throw new Error('Bundle plan requires exactly 3 topics');

    const user = api.getUser();
    const { data: biz } = await _sb.from('businesses').select('id').eq('user_id', user.id).single();
    if (!biz) throw new Error('Business not found');

    const amount = plan_type === 'single' ? 14.99 : 39.99;
    for (const topic_id of topic_ids) {
      const { data: existing } = await _sb.from('topic_subscriptions')
        .select('id').eq('business_id', biz.id).eq('topic_id', topic_id).eq('active', 1).single();
      if (!existing) {
        await _sb.from('topic_subscriptions').insert({ business_id: biz.id, topic_id, plan_type });
      }
    }
    await _sb.from('payments').insert({ user_id: user.id, amount, type: 'topic_subscription', reference_id: biz.id });
    return { message: `Subscribed to ${topic_ids.length} topic(s) for $${amount}` };
  },

  async _getMySubscriptions() {
    const user = api.getUser();
    const { data: biz } = await _sb.from('businesses').select('id').eq('user_id', user.id).single();
    if (!biz) throw new Error('Business not found');
    const { data, error } = await _sb.from('topic_subscriptions')
      .select('*, topics(name, description, icon)').eq('business_id', biz.id).eq('active', 1);
    api._throw(error);
    return data.map(s => ({ ...s, name: s.topics?.name, description: s.topics?.description, icon: s.topics?.icon }));
  },

  // ── Customers ──────────────────────────────────────────────

  async _submitInterest({ business_id, customer_name, customer_email, customer_phone, message }) {
    if (!business_id || !customer_name || !customer_email) {
      throw new Error('business_id, customer_name, and customer_email are required');
    }
    const { data: biz } = await _sb.from('businesses').select('id, free_leads_used').eq('id', business_id).single();
    if (!biz) throw new Error('Business not found');

    const autoUnlock = biz.free_leads_used < 5 ? 1 : 0;
    const { data, error } = await _sb.from('interest_forms').insert({
      business_id, customer_name, customer_email,
      customer_phone: customer_phone || null, message: message || null, unlocked: autoUnlock
    }).select().single();
    api._throw(error);

    if (autoUnlock) {
      await _sb.from('businesses').update({ free_leads_used: biz.free_leads_used + 1 }).eq('id', business_id);
    }
    return { message: 'Interest form submitted successfully', id: data.id };
  },

  async _submitComplaint({ customer_id, business_id, subject, description }) {
    if (!subject || !description) throw new Error('subject and description are required');
    const { data, error } = await _sb.from('complaints').insert({
      customer_id: customer_id || null, business_id: business_id || null, subject, description
    }).select().single();
    api._throw(error);
    return { message: 'Complaint submitted', id: data.id };
  },

  async _getCustomerActivity() {
    const user = api.getUser();
    const { data, error } = await _sb.from('interest_forms')
      .select('*, businesses(business_name)').eq('customer_email', user.email)
      .order('created_at', { ascending: false });
    api._throw(error);
    return data.map(f => ({ ...f, business_name: f.businesses?.business_name }));
  },

  // ── Admin ───────────────────────────────────────────────────

  async _adminStats() {
    const [u, b, v, p, t, c, rev] = await Promise.all([
      _sb.from('profiles').select('*', { count: 'exact', head: true }),
      _sb.from('businesses').select('*', { count: 'exact', head: true }),
      _sb.from('businesses').select('*', { count: 'exact', head: true }).eq('verified', 1),
      _sb.from('verification_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      _sb.from('topics').select('*', { count: 'exact', head: true }),
      _sb.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      _sb.from('payments').select('amount'),
    ]);
    const total_revenue = (rev.data || []).reduce((sum, r) => sum + r.amount, 0);
    return {
      total_users: u.count, total_businesses: b.count, verified_businesses: v.count,
      pending_verifications: p.count, active_topics: t.count, open_complaints: c.count, total_revenue
    };
  },

  async _adminUsers({ role, search } = {}) {
    let q = _sb.from('profiles').select('*');
    if (role) q = q.eq('role', role);
    if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    const { data, error } = await q.order('created_at', { ascending: false });
    api._throw(error);
    return data;
  },

  async _adminDeleteUser(id) {
    const { data: profile } = await _sb.from('profiles').select('role').eq('id', id).single();
    if (!profile) throw new Error('User not found');
    if (profile.role === 'admin') throw new Error('Cannot delete admin');
    const { error } = await _sb.from('profiles').delete().eq('id', id);
    api._throw(error);
    return { message: 'User deleted' };
  },

  async _adminVerifications() {
    const { data, error } = await _sb.from('verification_requests')
      .select('*, businesses(business_name, mission, profiles(email, name))')
      .order('submitted_at', { ascending: false });
    api._throw(error);
    return data.map(vr => ({
      ...vr,
      business_name: vr.businesses?.business_name,
      mission:       vr.businesses?.mission,
      email:         vr.businesses?.profiles?.email,
      owner_name:    vr.businesses?.profiles?.name,
    }));
  },

  async _adminApproveVerification(id) {
    const { data: vr } = await _sb.from('verification_requests').select('*').eq('id', id).single();
    if (!vr) throw new Error('Verification request not found');
    await _sb.from('verification_requests').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', id);
    await _sb.from('businesses').update({ verified: 1, verification_status: 'approved' }).eq('id', vr.business_id);
    return { message: 'Business verified and approved' };
  },

  async _adminRejectVerification(id, { notes } = {}) {
    const { data: vr } = await _sb.from('verification_requests').select('*').eq('id', id).single();
    if (!vr) throw new Error('Verification request not found');
    await _sb.from('verification_requests').update({ status: 'rejected', reviewed_at: new Date().toISOString(), notes: notes || null }).eq('id', id);
    await _sb.from('businesses').update({ verification_status: 'rejected' }).eq('id', vr.business_id);
    return { message: 'Verification rejected' };
  },

  async _adminComplaints({ status } = {}) {
    let q = _sb.from('complaints').select('*, profiles(name, email), businesses(business_name)');
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false });
    api._throw(error);
    return data.map(c => ({
      ...c,
      customer_name:  c.profiles?.name,
      customer_email: c.profiles?.email,
      business_name:  c.businesses?.business_name,
    }));
  },

  async _adminUpdateComplaint(id, { status }) {
    if (!['open', 'reviewing', 'resolved'].includes(status)) throw new Error('Invalid status');
    await _sb.from('complaints').update({ status }).eq('id', id);
    return { message: 'Complaint updated' };
  },

  async _adminBusinesses({ verified, verification_status } = {}) {
    let q = _sb.from('businesses').select('*, profiles(email, name)');
    if (verified !== undefined) q = q.eq('verified', verified === 'true' ? 1 : 0);
    if (verification_status) q = q.eq('verification_status', verification_status);
    const { data, error } = await q.order('created_at', { ascending: false });
    api._throw(error);
    return data.map(b => ({ ...b, email: b.profiles?.email, owner_name: b.profiles?.name }));
  },
};

// ── Nav auto-wiring (runs on every page) ──────────────────
// api.js is always loaded at the bottom of <body>, so DOM is already ready.
(function _wireNav() {
  const u = api.getUser();
  const role = u?.role;

  // Extract nav label text, ignoring the leading material icon span
  function navLabel(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.material-symbols-outlined').forEach(s => s.remove());
    return clone.textContent.trim();
  }

  const NAV_MAP = {
    // Top nav
    'Marketplace':      '/explore_student_businesses/code.html',
    'My Leads':         '/lead_manager/code.html',
    'Subscriptions':    '/topic_marketplace/code.html',
    'Admin':            '/admin_control_center/code.html',
    // Mobile bottom nav (consumer)
    'Explore':          '/explore_student_businesses/code.html',
    'My Interest':      '/customer_dashboard_activity/code.html',
    'Leads':            '/lead_manager/code.html',
    'Profile':          '/profile_editor/code.html',
    // Sidebar (business & admin)
    'Business Profile': '/profile_editor/code.html',
    'Lead Manager':     '/lead_manager/code.html',
    'Users':            '/admin_user_management/code.html',
    'Settings':         '/profile_editor/code.html',
    'Help Center':      '/explore_student_businesses/code.html',
    // Role-dependent sidebar entries
    'Dashboard': role === 'admin' ? '/admin_control_center/code.html' : '/business_dashboard/code.html',
    'Topic Hub':  role === 'admin' ? '/admin_topic_management/code.html'  : '/topic_marketplace/code.html',
  };

  // Footer / informational links → real destinations where one exists,
  // otherwise a friendly toast so nothing is a dead click.
  const FOOTER_MAP = {
    'Pricing':              '/topic_marketplace/code.html',
    'Verification Process': '/business_verification_flow/code.html',
    'Help Center':          '/explore_student_businesses/code.html',
    'Contact Us':           '/local_link_homepage/code.html',
  };

  // Fix all placeholder nav links
  document.querySelectorAll('a[href="#"]').forEach(el => {
    const text = navLabel(el);
    if (NAV_MAP[text]) { el.href = NAV_MAP[text]; return; }
    if (FOOTER_MAP[text]) { el.href = FOOTER_MAP[text]; return; }
    // Informational footer / social links with no dedicated page yet.
    const INFO = ['About Us', 'Privacy Policy', 'Terms of Service'];
    const aria = el.getAttribute('aria-label');
    if (INFO.includes(text) || aria === 'Facebook' || aria === 'Twitter') {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        showToast(`${aria || text} page is coming soon.`, 'success');
      });
    }
  });

  // Mobile bottom-nav items are sometimes <button>s instead of <a>s, so the
  // link wiring above misses them. Wire any nav-labelled button that isn't an
  // account/notification/logout control (those are handled separately below).
  document.querySelectorAll('nav button').forEach(btn => {
    const icon = btn.querySelector('.material-symbols-outlined');
    const iconName = icon ? icon.textContent.trim() : '';
    if (['account_circle', 'notifications', 'logout'].includes(iconName)) return;
    const text = navLabel(btn);
    const dest = NAV_MAP[text];
    if (dest && !btn.onclick) {
      btn.addEventListener('click', () => window.location.href = dest);
    }
  });

  // Hide role-restricted nav links based on the current user's role
  document.querySelectorAll('nav a, header nav a, aside nav a').forEach(link => {
    const txt = navLabel(link);
    if ((txt === 'My Leads' || txt === 'Subscriptions') && role !== 'business') {
      link.style.display = 'none';
    }
    if (txt === 'Admin' && role !== 'admin') {
      link.style.display = 'none';
    }
  });

  // Wire sidebar/nav Logout links that haven't been wired by page-level scripts
  document.querySelectorAll('a[href="#"]').forEach(el => {
    const icon = el.querySelector('.material-symbols-outlined');
    if (icon && icon.textContent.trim() === 'logout') {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        api.clearAuth();
        window.location.href = '/login_signup/code.html';
      });
    }
  });

  // Wire account_circle button → dropdown with Dashboard + Log Out
  document.querySelectorAll('button').forEach(btn => {
    const icon = btn.querySelector('.material-symbols-outlined');
    if (icon && icon.textContent.trim() === 'account_circle') {
      btn.style.position = 'relative';
      btn.onclick = (e) => {
        e.stopPropagation();
        const user = api.getUser();
        if (!user) { window.location.href = '/login_signup/code.html'; return; }

        const existing = document.getElementById('_ll_acct_menu');
        if (existing) { existing.remove(); return; }

        const menu = document.createElement('div');
        menu.id = '_ll_acct_menu';
        menu.style.cssText = [
          'position:absolute', 'right:0', 'top:calc(100% + 8px)',
          'background:#fff', 'border:1px solid #e2e8f0', 'border-radius:12px',
          'box-shadow:0 8px 24px rgba(0,0,0,0.12)', 'z-index:1000',
          'min-width:180px', 'overflow:hidden', 'font-family:inherit'
        ].join(';');
        menu.innerHTML = `
          <div style="padding:10px 16px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">${user.name || user.email}</div>
          <button id="_ll_dash_btn" style="width:100%;text-align:left;padding:10px 16px;font-size:14px;color:#334155;display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'">
            <span class="material-symbols-outlined" style="font-size:16px;">dashboard</span> Dashboard
          </button>
          <button id="_ll_logout_btn" style="width:100%;text-align:left;padding:10px 16px;font-size:14px;color:#dc2626;display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;border-top:1px solid #f1f5f9;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'">
            <span class="material-symbols-outlined" style="font-size:16px;">logout</span> Log Out
          </button>
        `;
        btn.appendChild(menu);

        menu.querySelector('#_ll_dash_btn').addEventListener('click', () => { menu.remove(); api.redirectByRole(user.role); });
        menu.querySelector('#_ll_logout_btn').addEventListener('click', () => { api.clearAuth(); window.location.href = '/login_signup/code.html'; });

        const close = (ev) => { if (!btn.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
        setTimeout(() => document.addEventListener('click', close), 0);
      };
    }
  });

  // Wire notification bell → dropdown. No notifications backend yet, so show
  // an empty-state panel instead of a dead click.
  document.querySelectorAll('button').forEach(btn => {
    const icon = btn.querySelector('.material-symbols-outlined');
    if (icon && icon.textContent.trim() === 'notifications') {
      btn.style.position = 'relative';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const existing = document.getElementById('_ll_notif_menu');
        if (existing) { existing.remove(); return; }

        const menu = document.createElement('div');
        menu.id = '_ll_notif_menu';
        menu.style.cssText = [
          'position:absolute', 'right:0', 'top:calc(100% + 8px)',
          'background:#fff', 'border:1px solid #e2e8f0', 'border-radius:12px',
          'box-shadow:0 8px 24px rgba(0,0,0,0.12)', 'z-index:1000',
          'width:260px', 'overflow:hidden', 'font-family:inherit', 'cursor:default'
        ].join(';');
        menu.innerHTML = `
          <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;font-size:14px;font-weight:600;color:#334155;">Notifications</div>
          <div style="padding:28px 16px;text-align:center;color:#94a3b8;font-size:13px;display:flex;flex-direction:column;align-items:center;gap:8px;">
            <span class="material-symbols-outlined" style="font-size:32px;color:#cbd5e1;">notifications_off</span>
            You're all caught up — no new notifications.
          </div>
        `;
        menu.addEventListener('click', (ev) => ev.stopPropagation());
        btn.appendChild(menu);

        const close = (ev) => { if (!btn.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
        setTimeout(() => document.addEventListener('click', close), 0);
      });
    }
  });
})();

// ── UI helpers (unchanged) ─────────────────────────────────

function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-4 right-4 z-50 px-6 py-3 rounded-lg text-white font-label-md text-sm shadow-lg transition-all
    ${type === 'success' ? 'bg-secondary' : 'bg-error'}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showLoading(btn, text = 'Loading...') {
  if (!btn) return;
  btn._origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="animate-spin material-symbols-outlined text-[18px]">refresh</span> ${text}`;
}

function hideLoading(btn) {
  if (!btn || !btn._origText) return;
  btn.disabled = false;
  btn.innerHTML = btn._origText;
}
