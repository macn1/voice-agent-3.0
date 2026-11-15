import {
  BarChart3,
  BellRing,
  CalendarCheck2,
  GraduationCap,
  Headset,
  House,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Smile,
  Stethoscope,
  Target,
  WalletCards,
} from 'lucide-react';

export const CATEGORIES = [
  'All',
  'Customer Support',
  'Sales',
  'Collections',
  'Reminder',
  'Recovery',
  'Lead Qualification',
  'Healthcare',
  'Education',
  'Real Estate',
];

/**
 * Icons and wording for the use cases the platform has templates for, by the
 * template's key. Which cards show, and their filter chips, come from the
 * templates themselves (GET /customer/agent-templates: key, categories).
 */
export const USE_CASES = [
  {
    key: 'appointment-management',
    title: 'Appointment management',
    description: 'Turn customer calls into instant bookings, reschedules, and confirmations.',
    icon: CalendarCheck2,

    warm: true,
  },
  {
    key: 'sales-discovery',
    title: 'Sales discovery',
    description: 'Meet customers with a natural conversation and turn warm leads into booked meetings.',
    icon: BarChart3,
  },
  {
    key: 'emi-collection',
    title: 'EMI collection',
    description: 'Manage EMI reminders and simplify customer payments with an AI voice agent.',
    icon: WalletCards,
  },
  {
    key: 'real-estate-lead-qualification',
    title: 'Real Estate Lead Qualification',
    description: 'Turn property inquiries into qualified leads and schedule site visits.',
    icon: House,
  },
  {
    key: 'cart-recovery',
    title: 'Cart recovery',
    description: 'Re-engage customers and recover abandoned carts with personalized calls.',
    icon: ShoppingCart,
  },
  {
    key: 'health-insurance-renewal',
    title: 'Health Insurance Renewal',
    description: 'Call policyholders to confirm and renew health insurance plans.',
    icon: ShieldCheck,
  },
  {
    key: 'order-support',
    title: 'Order status & support',
    description: 'Answer where-is-my-order calls, track shipments and raise tickets automatically.',
    icon: Headset,
  },
  {
    key: 'admission-enquiries',
    title: 'Admission enquiries',
    description: 'Guide prospective students through courses, fees and application deadlines.',
    icon: GraduationCap,
  },
  {
    key: 'payment-reminders',
    title: 'Payment reminders',
    description: 'Remind customers of upcoming dues in their language and capture promise-to-pay dates.',
    icon: BellRing,
  },
  {
    key: 'b2b-lead-qualification',
    title: 'B2B lead qualification',
    description: 'Qualify inbound leads on budget, need and timeline before handing them to sales.',
    icon: Target,
  },
  {
    key: 'patient-follow-ups',
    title: 'Patient follow-ups',
    description: 'Check on patients after visits, share care instructions and book follow-ups.',
    icon: Stethoscope,
  },
  {
    key: 'subscription-win-back',
    title: 'Subscription win-back',
    description: 'Call lapsed subscribers, learn why they left and offer them a way back.',
    icon: RotateCcw,
  },
  {
    key: 'feedback-surveys',
    title: 'Feedback & NPS surveys',
    description: 'Collect post-purchase feedback and NPS scores through quick, friendly calls.',
    icon: Smile,
  },
];

/** A template as a gallery card: its icon by key, falling back to a generic one. */
export function templateCard(t, Fallback) {
  const uc = USE_CASES.find((u) => u.key && u.key === t.key);
  return {
    id: t.id,
    key: t.key ?? t.id,
    title: t.name,
    description: t.description ?? uc?.description ?? '',
    icon: uc?.icon ?? Fallback,
    warm: !!uc?.warm,
    categories: Array.isArray(t.categories) ? t.categories : [],
    order: uc ? USE_CASES.indexOf(uc) : USE_CASES.length,
  };
}

/** The chips for a set of cards: All, then the known categories in order, then any others. */
export function categoriesOf(cards) {
  const present = new Set(cards.flatMap((c) => c.categories));
  const known = CATEGORIES.filter((c) => c !== 'All' && present.has(c));
  const other = [...present].filter((c) => !CATEGORIES.includes(c)).sort();
  return ['All', ...known, ...other];
}
