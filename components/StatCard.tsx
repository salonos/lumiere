type Props = {
  label: string;
  value: string;
  meta?: React.ReactNode;
};

export default function StatCard({ label, value, meta }: Props) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {meta ? <div className="stat-meta">{meta}</div> : null}
    </div>
  );
}
