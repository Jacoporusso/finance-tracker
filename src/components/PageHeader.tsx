export default function PageHeader({ title, description }: { title: string; description: string }) {
  return <header className="mb-6"><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">{description}</p></header>;
}
