import { Icon, type IconName } from '@/components/Icon';

interface Props { title: string; iconName: IconName; description?: string }

export function ComingSoon({ title, iconName, description }: Props) {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-sub">{description}</p>}
        </div>
      </div>
      <div className="empty">
        <div style={{ display: 'grid', placeItems: 'center', marginBottom: 8 }}>
          <Icon name={iconName} size={28} />
        </div>
        <div className="empty-title">Coming soon</div>
        <div className="empty-sub">This screen is part of a later phase of the Waymark redesign.</div>
      </div>
    </>
  );
}
