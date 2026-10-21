// Docuhotel — state management (localStorage backed, ready to swap for backend)
const LS_KEY = "docuhotel:v1";

const DEFAULT_STATUSES = [
  { id: "st_active",   key: "active",   color: "#14532d", bg: "#dcfce7", label: { es: "En vigor",            en: "Active",           de: "Gültig" } },
  { id: "st_draft",    key: "draft",    color: "#404040", bg: "#e5e5e3", label: { es: "Borrador",            en: "Draft",            de: "Entwurf" } },
  { id: "st_pending",  key: "pending",  color: "#1e3a8a", bg: "#dbeafe", label: { es: "Pendiente de aprobar", en: "Pending approval", de: "Genehmigung ausstehend" } },
  { id: "st_archived", key: "archived", color: "#6b6b6b", bg: "#efefee", label: { es: "Descatalogado",       en: "Archived",         de: "Archiviert" } },
];

const DEFAULT_CATEGORIES = [
  { id: "cat_oca",       name: "OCA" },
  { id: "cat_travelife", name: "Travelife" },
  { id: "cat_prl",       name: "Prevención de riesgos" },
];

// Global taxonomy: the same theme list is shared by every hotel.
const DEFAULT_THEMES = [
  { id: "theme_medioambiente", name: "Medio ambiente", sort: 0 },
  { id: "theme_calidad",       name: "Calidad", sort: 1 },
  { id: "theme_seguridad",     name: "Seguridad y salud", sort: 2 },
  { id: "theme_rrhh",          name: "Recursos humanos", sort: 3 },
];

const DEFAULT_DEPARTMENTS = [
  { id: "dep_housekeeping", name: "Housekeeping" },
  { id: "dep_fb",           name: "F&B" },
  { id: "dep_kitchen",      name: "Cocina" },
  { id: "dep_maint",        name: "Mantenimiento" },
  { id: "dep_direction",    name: "Dirección" },
  { id: "dep_hr",           name: "RRHH" },
];

const DEFAULT_PERIODS = [
  { id: "p_manual", months: 0, manual: true, label: { es: "Manual",  en: "Manual",   de: "Manuell" } },
  { id: "p_1m",  months: 1,  label: { es: "1 mes",     en: "1 month",   de: "1 Monat" } },
  { id: "p_2m",  months: 2,  label: { es: "2 meses",   en: "2 months",  de: "2 Monate" } },
  { id: "p_3m",  months: 3,  label: { es: "3 meses",   en: "3 months",  de: "3 Monate" } },
  { id: "p_6m",  months: 6,  label: { es: "6 meses",   en: "6 months",  de: "6 Monate" } },
  { id: "p_12m", months: 12, label: { es: "1 año",     en: "1 year",    de: "1 Jahr" } },
  { id: "p_24m", months: 24, label: { es: "2 años",    en: "2 years",   de: "2 Jahre" } },
  { id: "p_36m", months: 36, label: { es: "3 años",    en: "3 years",   de: "3 Jahre" } },
  { id: "p_60m", months: 60, label: { es: "5 años",    en: "5 years",   de: "5 Jahre" } },
  { id: "p_120m",months: 120,label: { es: "10 años",   en: "10 years",  de: "10 Jahre" } },
  { id: "p_240m",months: 240,label: { es: "20 años",   en: "20 years",  de: "20 Jahre" } },
];

const DEFAULT_RESPONSIBLES = [
  { id: "r_dir",  name: "Dirección General",   email: "direccion@hotel.com" },
  { id: "r_jefe", name: "Jefa de Recepción",   email: "recepcion@hotel.com" },
  { id: "r_gov",  name: "Gobernanta",          email: "gobernanta@hotel.com" },
  { id: "r_chef", name: "Chef Ejecutivo",      email: "chef@hotel.com" },
  { id: "r_main", name: "Jefe de Mantenimiento", email: "mantenimiento@hotel.com" },
];

const DEFAULT_USERS = [
  { id: "u_admin", name: "Administrador", email: "admin@hotel.com", role: "admin", departments: ["*"] },
  { id: "u_dir",   name: "Ana Dirección", email: "ana@hotel.com",   role: "dept_head",  departments: ["dep_direction"] },
  { id: "u_gov",   name: "Marta Gobernanta", email: "marta@hotel.com", role: "dept_head", departments: ["dep_housekeeping"] },
  { id: "u_emp",   name: "Pedro Camarero", email: "pedro@hotel.com",  role: "employee", departments: ["dep_fb"] },
];

// --- sample documents (pdf data is null; the demo shows a generated placeholder) ---
function buildSampleDocs() {
  const today = new Date();
  const offsetDays = (d) => new Date(today.getTime() + d * 86400000).toISOString();
  return [
    {
      id: "doc_1",
      title: "Plan de evacuación 2026",
      description: "Plan oficial de evacuación de huéspedes y personal.",
      categoryId: "cat_prl",
      statusId: "st_active",
      departments: ["*"],
      responsibleIds: ["r_dir", "r_main"],
      periodId: "p_12m",
      startDate: offsetDays(-300),
      expiryDate: offsetDays(65),
      uploadedBy: "u_admin",
      uploadedAt: offsetDays(-300),
      file: { name: "plan_evacuacion_2026.pdf", size: 184320, dataUrl: null },
      version: 3,
      publicAccess: true,
      linkedDocIds: ["doc_2", "doc_4"],
    },
    {
      id: "doc_2",
      title: "Manual de housekeeping — limpieza profunda",
      description: "Procedimiento de limpieza profunda de habitaciones.",
      categoryId: "cat_travelife",
      statusId: "st_active",
      departments: ["dep_housekeeping"],
      responsibleIds: ["r_gov"],
      periodId: "p_24m",
      startDate: offsetDays(-700),
      expiryDate: offsetDays(20),
      uploadedBy: "u_gov",
      uploadedAt: offsetDays(-700),
      file: { name: "housekeeping_limpieza_profunda.pdf", size: 421376, dataUrl: null },
      version: 2,
    },
    {
      id: "doc_3",
      title: "Inspección OCA ascensores",
      description: "Última inspección reglamentaria de ascensores.",
      categoryId: "cat_oca",
      statusId: "st_active",
      departments: ["dep_maint", "dep_direction"],
      responsibleIds: ["r_main"],
      periodId: "p_12m",
      startDate: offsetDays(-150),
      expiryDate: offsetDays(215),
      uploadedBy: "u_admin",
      uploadedAt: offsetDays(-150),
      file: { name: "oca_ascensores.pdf", size: 92160, dataUrl: null },
      version: 1,
      publicAccess: true,
    },
    {
      id: "doc_4",
      title: "Protocolo de alérgenos en cocina",
      description: "Protocolo APPCC para gestión de alérgenos.",
      categoryId: "cat_travelife",
      statusId: "st_pending",
      departments: ["dep_kitchen", "dep_fb"],
      responsibleIds: ["r_chef"],
      periodId: "p_12m",
      startDate: offsetDays(-30),
      expiryDate: offsetDays(335),
      uploadedBy: "u_dir",
      uploadedAt: offsetDays(-30),
      file: { name: "alergenos_cocina.pdf", size: 156672, dataUrl: null },
      version: 1,
    },
    {
      id: "doc_5",
      title: "Política de RRHH 2024 (antigua)",
      description: "Versión anterior — sustituida por la edición 2026.",
      categoryId: "cat_travelife",
      statusId: "st_archived",
      departments: ["dep_hr"],
      responsibleIds: ["r_dir"],
      periodId: "p_12m",
      startDate: offsetDays(-800),
      expiryDate: offsetDays(-435),
      uploadedBy: "u_admin",
      uploadedAt: offsetDays(-800),
      file: { name: "politica_rrhh_2024.pdf", size: 67584, dataUrl: null },
      version: 1,
    },
    {
      id: "doc_6",
      title: "Carta de restaurante — borrador primavera",
      description: "Borrador en revisión antes de aprobación.",
      categoryId: "cat_travelife",
      statusId: "st_draft",
      departments: ["dep_fb", "dep_kitchen"],
      responsibleIds: ["r_chef"],
      periodId: "p_6m",
      startDate: offsetDays(-2),
      expiryDate: offsetDays(180),
      uploadedBy: "u_admin",
      uploadedAt: offsetDays(-2),
      file: { name: "carta_primavera.pdf", size: 245760, dataUrl: null },
      version: 1,
    },
  ];
}

function defaultState() {
  return {
    statuses: DEFAULT_STATUSES,
    categories: DEFAULT_CATEGORIES,
    themes: DEFAULT_THEMES,
    departments: DEFAULT_DEPARTMENTS,
    periods: DEFAULT_PERIODS,
    responsibles: DEFAULT_RESPONSIBLES,
    users: DEFAULT_USERS,
    documents: buildSampleDocs(),
    requests: [
      {
        id: "req_demo_submitted",
        title: "Documentación PRL — Carlos Méndez (Recepción)",
        notes: "Carlos, sube todos los documentos del listado. Los marcados como obligatorios son imprescindibles para tu alta.",
        items: [
          { id: "it_d1", title: "DNI / NIE (ambas caras)", comments: "Asegúrate de que se lea claramente.", required: true, files: [
            { name: "dni_carlos_mendez.pdf", size: 245678, type: "application/pdf", uploadedAt: new Date(Date.now() - 86400000 * 3).toISOString(), dataUrl: "data:application/pdf;base64,JVBERi0xLjAKJSUlJQoxIDAgb2JqPDw+PgplbmRvYmoKdHJhaWxlcjw8L1Jvb3QgMSAwIFI+Pgo=" },
          ]},
          { id: "it_d2", title: "Certificado de formación PRL (20h)", comments: "Mínimo 20h. Vigente.", required: true, files: [
            { name: "prl_20h_carlos.pdf", size: 487923, type: "application/pdf", uploadedAt: new Date(Date.now() - 86400000 * 3 + 3600000).toISOString(), dataUrl: "data:application/pdf;base64,JVBERi0xLjAKJSUlJQoxIDAgb2JqPDw+PgplbmRvYmoKdHJhaWxlcjw8L1Jvb3QgMSAwIFI+Pgo=" },
          ]},
          { id: "it_d3", title: "Reconocimiento médico", comments: "Apto para el puesto.", required: true, files: [
            { name: "reconocimiento_medico.pdf", size: 198432, type: "application/pdf", uploadedAt: new Date(Date.now() - 86400000 * 3 + 7200000).toISOString(), dataUrl: "data:application/pdf;base64,JVBERi0xLjAKJSUlJQoxIDAgb2JqPDw+PgplbmRvYmoKdHJhaWxlcjw8L1Jvb3QgMSAwIFI+Pgo=" },
          ]},
          { id: "it_d4", title: "Cartilla bancaria (IBAN)", comments: "Para la nómina.", required: false, files: [
            { name: "iban_carlos.pdf", size: 88912, type: "application/pdf", uploadedAt: new Date(Date.now() - 86400000 * 3 + 9000000).toISOString(), dataUrl: "data:application/pdf;base64,JVBERi0xLjAKJSUlJQoxIDAgb2JqPDw+PgplbmRvYmoKdHJhaWxlcjw8L1Jvb3QgMSAwIFI+Pgo=" },
          ]},
        ],
        recipientName: "Carlos Méndez",
        recipientEmail: "carlos.mendez@hotel.com",
        shareToken: "req-demo-submitted",
        expiresAt: new Date(Date.now() + 86400000 * 7).toISOString(),
        maxFileSizeMb: 10,
        status: "submitted",
        savedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
        submittedAt: new Date(Date.now() - 86400000 * 3 + 9100000).toISOString(),
        log: [
          { ts: new Date(Date.now() - 86400000 * 3).toISOString(), action: "upload", details: "DNI / NIE: dni_carlos_mendez.pdf (240 KB)" },
          { ts: new Date(Date.now() - 86400000 * 3 + 3600000).toISOString(), action: "upload", details: "Certificado PRL: prl_20h_carlos.pdf (476 KB)" },
          { ts: new Date(Date.now() - 86400000 * 3 + 7200000).toISOString(), action: "upload", details: "Reconocimiento médico: reconocimiento_medico.pdf (194 KB)" },
          { ts: new Date(Date.now() - 86400000 * 3 + 9000000).toISOString(), action: "upload", details: "Cartilla bancaria: iban_carlos.pdf (87 KB)" },
          { ts: new Date(Date.now() - 86400000 * 3 + 9100000).toISOString(), action: "submit", details: "Envío definitivo" },
        ],
        createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 3 + 9100000).toISOString(),
      },
      {
        id: "req_demo_expiring",
        title: "Contratos proveedor lavandería 2026",
        notes: "Por favor envía los contratos firmados y vigentes antes de la auditoría.",
        items: [
          { id: "it_e1", title: "Contrato de servicios firmado", comments: "Con firma de ambas partes.", required: true, files: [] },
          { id: "it_e2", title: "Seguro de responsabilidad civil", comments: "Vigente a 2026.", required: true, files: [] },
          { id: "it_e3", title: "Certificado ISO 14001", comments: "Si aplica.", required: false, files: [] },
        ],
        recipientName: "Lavandería Atlántica S.L.",
        recipientEmail: "admin@lavanderia-atlantica.com",
        shareToken: "req-demo-expiring",
        expiresAt: new Date(Date.now() + 86400000 * 4).toISOString(),
        maxFileSizeMb: 15,
        status: "open",
        savedAt: null,
        submittedAt: null,
        log: [],
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 10).toISOString(),
      },
      {
        id: "req_sample",
        title: "Documentación PRL para nuevo empleado",
        notes: "Ana, por favor sube todos los certificados antes del viernes. Los marcados como obligatorios son imprescindibles.",
        items: [
          { id: "it_1", title: "DNI / NIE (ambas caras)", comments: "Asegúrate de que se lea claramente.", required: true, files: [] },
          { id: "it_2", title: "Certificado de formación PRL", comments: "Mínimo 20h. Vigente.", required: true, files: [] },
          { id: "it_3", title: "Reconocimiento médico", comments: "", required: false, files: [] },
        ],
        recipientEmail: "ana@empleado.com",
        recipientName: "Ana Lopez",
        shareToken: "req-sample-demo",
        expiresAt: new Date(Date.now() + 86400000 * 14).toISOString(),
        maxFileSizeMb: 10,
        status: "open",
        savedAt: null,
        submittedAt: null,
        log: [],
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
    ],
    projects: [
      {
        id: "proj_seguro",
        name: "Auditoría seguro de responsabilidad civil 2026",
        notes: "Renovación anual. Auditor: Mapfre — Sr. García. Pide pruebas de plan de evacuación, formación PRL y mantenimientos de cocina.",
        status: "active",
        docIds: ["doc_1", "doc_2", "doc_4"],
        shareToken: "",
        shareExpiresAt: "",
        createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
    ],
    log: [
      {
        id: "log_1",
        ts: new Date(Date.now() - 86400000 * 2).toISOString(),
        userId: "u_admin",
        action: "doc_create",
        details: "Plan de evacuación 2026",
      },
      {
        id: "log_2",
        ts: new Date(Date.now() - 86400000).toISOString(),
        userId: "u_gov",
        action: "doc_update",
        details: "Manual de housekeeping — limpieza profunda",
      },
      {
        id: "log_3",
        ts: new Date(Date.now() - 3600000 * 5).toISOString(),
        userId: "u_admin",
        action: "doc_status",
        details: "Política de RRHH 2024 → Descatalogado",
      },
    ],
    config: {
      currentUserId: "u_admin",
      lang: "es",
      publicToken: "hotel-" + Math.random().toString(36).slice(2, 10),
      hotel: {
        name: "Hotel Demo",
        timezone: "Europe/Madrid",
        country: "ES",
      },
      permissions: {
        admin: {
          view: true, create: true, edit: true, delete: true, approve: true,
          manageUsers: true, viewLog: true, allDepts: true, configTemplates: true, adminPanel: true,
        },
        dept_head: {
          view: true, create: true, edit: true, delete: false, approve: true,
          manageUsers: false, viewLog: true, allDepts: false, configTemplates: false, adminPanel: false,
        },
        employee: {
          view: true, create: false, edit: false, delete: false, approve: false,
          manageUsers: false, viewLog: false, allDepts: false, configTemplates: false, adminPanel: false,
        },
      },
      email: {
        provider: "resend",
        apiKey: "",
        fromAddress: "alarmas@hotel.com",
        fromName: "Docuhotel",
        enabled: false,
      },
      emailLog: [
        { id: "elog_1", ts: new Date(Date.now() - 86400000 * 1).toISOString(), to: "ana@hotel.com",   subject: "Documento próximo a caducar: Plan de evacuación 2026", status: "sent", trigger: "expiry_30" },
        { id: "elog_2", ts: new Date(Date.now() - 86400000 * 1).toISOString(), to: "marta@hotel.com", subject: "Documento próximo a caducar: Manual de housekeeping", status: "sent", trigger: "expiry_15" },
        { id: "elog_3", ts: new Date(Date.now() - 3600000 * 4).toISOString(), to: "admin@hotel.com",  subject: "Test email", status: "sent", trigger: "test" },
      ],
      emailTemplates: [
        {
          id: "tpl_published", trigger: "published", enabled: true,
          recipients: ["dept_head", "employee"], sendHour: 8,
          attachPdf: false, includeViewLink: true,
          name: { es: "Documento nuevo publicado", en: "New document published", de: "Neues Dokument veröffentlicht" },
          subject: {
            es: "Nuevo documento publicado: {documento}",
            en: "New document published: {documento}",
            de: "Neues Dokument veröffentlicht: {documento}",
          },
          body: {
            es: "Hola {destinatario},\n\nSe ha publicado un nuevo documento que afecta a tu departamento ({departamento}):\n\n• Título: {documento}\n• Categoría: {categoria}\n• En vigor desde: {fecha_vigor}\n• Caducidad: {fecha_caducidad}\n\nPuedes consultarlo en Docuhotel.\n\n— {remitente}",
            en: "Hello {destinatario},\n\nA new document affecting your department ({departamento}) has been published:\n\n• Title: {documento}\n• Category: {categoria}\n• Effective from: {fecha_vigor}\n• Expires: {fecha_caducidad}\n\nYou can review it in Docuhotel.\n\n— {remitente}",
            de: "Hallo {destinatario},\n\nEin neues Dokument, das Ihre Abteilung ({departamento}) betrifft, wurde veröffentlicht:\n\n• Titel: {documento}\n• Kategorie: {categoria}\n• Gültig ab: {fecha_vigor}\n• Läuft ab: {fecha_caducidad}\n\nSie können es in Docuhotel einsehen.\n\n— {remitente}",
          },
        },
        {
          id: "tpl_updated", trigger: "updated", enabled: true,
          recipients: ["dept_head", "employee"], sendHour: 8,
          attachPdf: false, includeViewLink: true,
          name: { es: "Documento actualizado (nueva versión)", en: "Document updated (new version)", de: "Dokument aktualisiert (neue Version)" },
          subject: {
            es: "Nueva versión disponible: {documento} (v{version})",
            en: "New version available: {documento} (v{version})",
            de: "Neue Version verfügbar: {documento} (v{version})",
          },
          body: {
            es: "Hola {destinatario},\n\nSe ha publicado una nueva versión del documento {documento} (versión {version}).\n\nDepartamento afectado: {departamento}\nCaducidad: {fecha_caducidad}\n\nRevisa los cambios en Docuhotel.\n\n— {remitente}",
            en: "Hello {destinatario},\n\nA new version of document {documento} (version {version}) has been published.\n\nAffected department: {departamento}\nExpires: {fecha_caducidad}\n\nReview the changes in Docuhotel.\n\n— {remitente}",
            de: "Hallo {destinatario},\n\nEine neue Version des Dokuments {documento} (Version {version}) wurde veröffentlicht.\n\nBetroffene Abteilung: {departamento}\nLäuft ab: {fecha_caducidad}\n\nÜberprüfen Sie die Änderungen in Docuhotel.\n\n— {remitente}",
          },
        },
        {
          id: "tpl_approved", trigger: "approved", enabled: true,
          recipients: ["dept_head"], sendHour: 8,
          attachPdf: false, includeViewLink: true,
          name: { es: "Documento aprobado / vigente", en: "Document approved / effective", de: "Dokument genehmigt / gültig" },
          subject: {
            es: "Documento aprobado y vigente: {documento}",
            en: "Document approved and effective: {documento}",
            de: "Dokument genehmigt und gültig: {documento}",
          },
          body: {
            es: "Hola {destinatario},\n\nEl documento {documento} ha sido aprobado y está vigente desde el {fecha_vigor}.\n\nDepartamento: {departamento}\nCaducidad: {fecha_caducidad}\n\n— {remitente}",
            en: "Hello {destinatario},\n\nDocument {documento} has been approved and is effective from {fecha_vigor}.\n\nDepartment: {departamento}\nExpires: {fecha_caducidad}\n\n— {remitente}",
            de: "Hallo {destinatario},\n\nDokument {documento} wurde genehmigt und ist seit dem {fecha_vigor} gültig.\n\nAbteilung: {departamento}\nLäuft ab: {fecha_caducidad}\n\n— {remitente}",
          },
        },
        {
          id: "tpl_expiry_60", trigger: "expiry_60", enabled: true,
          recipients: ["dept_head"], sendHour: 8,
          attachPdf: false, includeViewLink: true,
          name: { es: "Próximo a caducar — 60 días", en: "Expiring soon — 60 days", de: "Läuft bald ab — 60 Tage" },
          subject: {
            es: "[Aviso 60 días] Documento próximo a caducar: {documento}",
            en: "[60-day notice] Document expiring soon: {documento}",
            de: "[60-Tage-Hinweis] Dokument läuft bald ab: {documento}",
          },
          body: {
            es: "Hola {destinatario},\n\nEl documento {documento} ({departamento}) caducará en 60 días, el {fecha_caducidad}.\n\nPor favor, planifica su renovación con tiempo.\n\n— {remitente}",
            en: "Hello {destinatario},\n\nDocument {documento} ({departamento}) will expire in 60 days, on {fecha_caducidad}.\n\nPlease plan its renewal in advance.\n\n— {remitente}",
            de: "Hallo {destinatario},\n\nDas Dokument {documento} ({departamento}) läuft in 60 Tagen ab, am {fecha_caducidad}.\n\nBitte planen Sie die Erneuerung rechtzeitig.\n\n— {remitente}",
          },
        },
        {
          id: "tpl_expiry_30", trigger: "expiry_30", enabled: true,
          recipients: ["dept_head"], sendHour: 8,
          attachPdf: false, includeViewLink: true,
          name: { es: "Próximo a caducar — 30 días", en: "Expiring soon — 30 days", de: "Läuft bald ab — 30 Tage" },
          subject: {
            es: "[Aviso 30 días] Documento próximo a caducar: {documento}",
            en: "[30-day notice] Document expiring soon: {documento}",
            de: "[30-Tage-Hinweis] Dokument läuft bald ab: {documento}",
          },
          body: {
            es: "Hola {destinatario},\n\nQuedan 30 días para que caduque el documento {documento} ({departamento}). Fecha de caducidad: {fecha_caducidad}.\n\nInicia el proceso de renovación cuanto antes.\n\n— {remitente}",
            en: "Hello {destinatario},\n\n30 days remain before document {documento} ({departamento}) expires. Expiry date: {fecha_caducidad}.\n\nStart the renewal process as soon as possible.\n\n— {remitente}",
            de: "Hallo {destinatario},\n\nNoch 30 Tage bis zum Ablauf des Dokuments {documento} ({departamento}). Ablaufdatum: {fecha_caducidad}.\n\nStarten Sie den Erneuerungsprozess so bald wie möglich.\n\n— {remitente}",
          },
        },
        {
          id: "tpl_expiry_15", trigger: "expiry_15", enabled: true,
          recipients: ["dept_head", "admin"], sendHour: 8,
          attachPdf: false, includeViewLink: true,
          name: { es: "Próximo a caducar — 15 días", en: "Expiring soon — 15 days", de: "Läuft bald ab — 15 Tage" },
          subject: {
            es: "⚠ [Urgente · 15 días] {documento} caduca el {fecha_caducidad}",
            en: "⚠ [Urgent · 15 days] {documento} expires on {fecha_caducidad}",
            de: "⚠ [Dringend · 15 Tage] {documento} läuft am {fecha_caducidad} ab",
          },
          body: {
            es: "Hola {destinatario},\n\nATENCIÓN: Quedan solo 15 días para que caduque el documento {documento} del departamento {departamento}.\n\nFecha de caducidad: {fecha_caducidad}\n\nEs urgente iniciar la renovación.\n\n— {remitente}",
            en: "Hello {destinatario},\n\nATTENTION: Only 15 days remain before document {documento} ({departamento}) expires.\n\nExpiry date: {fecha_caducidad}\n\nRenewal is urgent.\n\n— {remitente}",
            de: "Hallo {destinatario},\n\nACHTUNG: Nur noch 15 Tage bis zum Ablauf des Dokuments {documento} ({departamento}).\n\nAblaufdatum: {fecha_caducidad}\n\nDie Erneuerung ist dringend.\n\n— {remitente}",
          },
        },
        {
          id: "tpl_expired", trigger: "expired", enabled: true,
          recipients: ["dept_head", "admin"], sendHour: 8,
          attachPdf: false, includeViewLink: true,
          name: { es: "Documento caducado (mismo día)", en: "Document expired (same day)", de: "Dokument abgelaufen (selber Tag)" },
          subject: {
            es: "🛑 CADUCADO: {documento} — {departamento}",
            en: "🛑 EXPIRED: {documento} — {departamento}",
            de: "🛑 ABGELAUFEN: {documento} — {departamento}",
          },
          body: {
            es: "Hola {destinatario},\n\nEl documento {documento} ({departamento}) ha CADUCADO hoy ({fecha_caducidad}).\n\nDebe renovarse de forma inmediata. Hasta entonces, no se considera vigente para auditorías.\n\n— {remitente}",
            en: "Hello {destinatario},\n\nDocument {documento} ({departamento}) has EXPIRED today ({fecha_caducidad}).\n\nIt must be renewed immediately. Until then, it is not considered effective for audits.\n\n— {remitente}",
            de: "Hallo {destinatario},\n\nDas Dokument {documento} ({departamento}) ist heute ({fecha_caducidad}) ABGELAUFEN.\n\nEs muss umgehend erneuert werden. Bis dahin gilt es bei Audits nicht als gültig.\n\n— {remitente}",
          },
        },
      ],
    },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // shallow merge to gain forward-compat fields
    const def = defaultState();
    return { ...def, ...parsed, projects: parsed.projects || [], requests: parsed.requests || [], config: { ...def.config, ...(parsed.config || {}), email: { ...def.config.email, ...((parsed.config || {}).email || {}) } } };
  } catch {
    return defaultState();
  }
}

function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

function uid(prefix = "id") {
  return prefix + "_" + Math.random().toString(36).slice(2, 9);
}

function addMonths(dateIso, months) {
  const d = new Date(dateIso);
  const targetMonth = d.getMonth() + months;
  d.setMonth(targetMonth);
  return d.toISOString();
}

function daysUntil(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

// ── Backend bridge ────────────────────────────────────────────────────
// In Supabase mode (DocuApi.offline === false) we load from the cloud and
// debounce-write changes back. The rest of the app keeps using setState +
// saveState transparently.

// Guard against overlapping loads: the boot effect and the auth-state listener
// can both ask for the same data on startup. Without this they fire two full
// waterfalls in parallel, which is a big chunk of the "20 seconds to load" pain.
let _loadInFlight = null;
let _loadInFlightKey = null;
function loadStateFromBackend(targetHotelId, preloadedSession) {
  const key = targetHotelId || "__me__";
  if (_loadInFlight && _loadInFlightKey === key) return _loadInFlight;
  _loadInFlightKey = key;
  _loadInFlight = _loadStateFromBackend(targetHotelId, preloadedSession).finally(() => {
    _loadInFlight = null;
    _loadInFlightKey = null;
  });
  return _loadInFlight;
}

async function _loadStateFromBackend(targetHotelId, preloadedSession) {
  if (!window.DocuApi || window.DocuApi.offline) return loadState();
  const _t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
  const _perf = (label) => console.info(`[docuhotel] ${label}: ${Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - _t0)}ms`);
  // Phase 1: identify the user + their primary hotel. This is a cheap PK
  // lookup with one FK join and must succeed before we can do anything.
  // Errors here propagate so the boot screen can surface them.
  const me = await window.DocuApi.getMe(preloadedSession);
  _perf("getMe");
  if (!me) return null; // not authenticated → caller will show login
  const meHotel = {
    id: me.hotel.id, name: me.hotel.name, country: me.hotel.country,
    timezone: me.hotel.timezone, publicToken: me.hotel.public_token,
  };
  // Phase 2: load the full hotel state + the accessible-hotels list
  // concurrently. listAccessibleHotels was blocking startup for 60s+ on
  // Supabase projects with many hotels because the table-scan RLS path is
  // O(N²); now it's optional — if it doesn't return in 12s we proceed with
  // just the user's primary hotel (the switcher will hide or only show one
  // option, which is fine; the next reload may catch a warmer backend).
  const wanted = targetHotelId || me.hotel.id;
  // The timer is cleared when the list arrives: otherwise the ">12s" warning
  // fired on every load even when the RPC answered in milliseconds.
  let accessibleTimer = null;
  const accessiblePromise = Promise.race([
    window.DocuApi.listAccessibleHotels().then((arr) => (arr && arr.length ? arr : [meHotel]),
      (e) => { console.warn("[docuhotel] listAccessibleHotels failed:", e?.message || e); return [meHotel]; })
      .finally(() => clearTimeout(accessibleTimer)),
    new Promise((resolve) => { accessibleTimer = setTimeout(() => {
      console.warn("[docuhotel] listAccessibleHotels >12s; continuing with primary hotel only");
      resolve([meHotel]);
    }, 12000); }),
  ]);
  const [accessible, s] = await Promise.all([
    accessiblePromise,
    window.DocuApi.loadFullState(wanted),
  ]);
  _perf("loadStateFromBackend total");
  if (!s) return null;
  const loadedHotel = (accessible || []).find((h) => h.id === wanted) || meHotel;
  // Bridge: populate config with auth-derived currentUserId + public token.
  const def = defaultState().config;
  s.config = {
    ...def,
    ...(s.config || {}),
    emailLog: s.config?.emailLog || [],
    emailTemplates: (s.config?.emailTemplates?.length ? s.config.emailTemplates : def.emailTemplates),
    currentUserId: me.authUser.id,
    lang: s.config?.lang || "es",
    publicToken: loadedHotel.publicToken,
    hotel: {
      name: loadedHotel.name,
      country: loadedHotel.country,
      timezone: loadedHotel.timezone,
    },
    isRegional: !!me.profile.is_regional,
    myHotelId: me.hotel.id,
    accessibleHotels: accessible,
  };
  // Ensure we always have at least the authenticated user in the list, even
  // if the app_users row hasn't been fetched yet.
  if (!s.users.find((u) => u.id === me.authUser.id)) {
    s.users.push({
      id: me.authUser.id, name: me.profile.name, email: me.profile.email,
      role: me.profile.role, departments: me.profile.departments || [],
    });
  }
  // Cache snapshot for diffing.
  window.__docuPrevState = JSON.parse(JSON.stringify(s));
  return s;
}

let _saveTimer = null;
function saveStateToBackend(next) {
  // Always mirror to localStorage as a safety net for tab reloads.
  saveState(next);
  if (!window.DocuApi || window.DocuApi.offline) return;
  if (!next?.hotelId) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const prev = window.__docuPrevState;
    try {
      await window.DocuApi.saveDiff(prev, next);
      window.__docuPrevState = JSON.parse(JSON.stringify(next));
    } catch (e) {
      console.error("saveStateToBackend", e);
    }
  }, 600);
}

// Remove a document from the diff snapshot so dropping it from local state
// does NOT issue a DELETE on the backend row. Used when a doc is re-homed or
// unshared from the current hotel but must keep existing in other hotels.
function forgetDocument(docId) {
  const p = window.__docuPrevState;
  if (p?.documents) p.documents = p.documents.filter((d) => d.id !== docId);
}

window.DocuStore = {
  LS_KEY, defaultState, loadState, saveState,
  loadStateFromBackend, saveStateToBackend,
  uid, addMonths, daysUntil, forgetDocument,
};
