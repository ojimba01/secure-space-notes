import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, FileText, Phone, Mail, MapPin, AlertTriangle } from 'lucide-react';
import { isSetupComplete, missingSetupShort } from '@/lib/workflow';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  member_id?: string;
  insurance?: string;
  status: string;
  intake_date: string;
  assigned_employee_id?: string | null;
  iat_date?: string | null;
  hsp_150_date?: string | null;
  hsp_180_date?: string | null;
}

const addDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d;
};

const today = () => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
};

type MilestoneStatus = {
  label: string;
  className: string;
};

const milestoneStatus = (dueDate: Date): MilestoneStatus => {
  const diff = Math.ceil((dueDate.getTime() - today().getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) {
    return {
      label: `Overdue by ${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'}`,
      className: 'bg-destructive text-destructive-foreground',
    };
  }
  if (diff === 0) {
    return { label: 'Due today', className: 'bg-destructive text-destructive-foreground' };
  }
  if (diff <= 14) {
    return {
      label: `Due in ${diff} day${diff === 1 ? '' : 's'}`,
      className: 'bg-amber-500 text-white dark:bg-amber-600',
    };
  }
  return {
    label: `Due in ${diff} days`,
    className: 'bg-muted text-muted-foreground',
  };
};

interface ClientCardProps {
  client: Client;
  onSelect: (client: Client) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  showManager?: boolean;
  assignedManagerName?: string | null;
}

export const ClientCard: React.FC<ClientCardProps> = ({
  client,
  onSelect,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  showManager = false,
  assignedManagerName = null,
}) => {
  const handleClick = () => {
    if (selectionMode && onToggleSelect) {
      onToggleSelect(client.id);
    } else {
      onSelect(client);
    }
  };

  const pendingNext = (() => {
    if (!client.hsp_180_date) return false;
    const due = new Date(client.hsp_180_date);
    due.setDate(due.getDate() + 180);
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t >= due;
  })();

  const milestones = [
    { label: 'IAT (30-day)', start: client.iat_date, offset: 30, finished: !!client.hsp_150_date },
    { label: 'HSP 150-day', start: client.hsp_150_date, offset: 150, finished: !!client.hsp_180_date },
    { label: 'HSP 180-day', start: client.hsp_180_date, offset: 180, finished: false },
  ]
    .filter((m) => !!m.start)
    .map((m) => {
      const due = addDays(m.start as string, m.offset);
      const status = m.finished
        ? { label: 'Complete', className: 'bg-green-600 text-white dark:bg-green-700' }
        : milestoneStatus(due);
      return { label: m.label, due, status };
    });

  return (
    <Card
      className={`hover:shadow-md transition-shadow cursor-pointer ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
      onClick={handleClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">
            {client.first_name} {client.last_name}
          </CardTitle>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
              {client.status}
            </Badge>
            {pendingNext && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Next action overdue
              </Badge>
            )}
            {selectionMode && (
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggleSelect?.(client.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${client.first_name} ${client.last_name}`}
              />
            )}
          </div>
        </div>
        {/* What this client still needs, on its own line and one badge each.
            Beside the name they ran together and pushed it along; a client
            missing all three had a single badge wider than the card.

            Without them, showing an incomplete client would only move the
            confusion: they would appear on the list and then be absent from
            touchpoints and billing with nothing explaining why. */}
        {!isSetupComplete(client) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {missingSetupShort(client).map((part) => (
              <Badge
                key={part}
                variant="secondary"
                className="gap-1 bg-amber-100 text-amber-900 font-normal"
              >
                <AlertTriangle className="h-3 w-3" />
                {part}
              </Badge>
            ))}
          </div>
        )}
        {client.member_id && (
          <p className="text-sm text-muted-foreground">Member ID: {client.member_id}</p>
        )}
        {client.insurance && (
          <p className="text-sm text-muted-foreground">Insurance: <span className="font-medium text-foreground">{client.insurance}</span></p>
        )}
        {showManager && (
          assignedManagerName ? (
            <p className="text-sm font-medium text-green-600 dark:text-green-500">
              Case Manager: {assignedManagerName}
            </p>
          ) : (
            <p className="text-sm font-medium text-red-600 dark:text-red-500">
              Unassigned
            </p>
          )
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {client.email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{client.email}</span>
          </div>
        )}
        {client.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span>{client.phone}</span>
          </div>
        )}
        {client.address && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{client.address}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span>Intake: {new Date(client.intake_date).toLocaleDateString()}</span>
        </div>
        <div className="pt-1 border-t mt-2">
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Intake Milestones</p>
          {milestones.length === 0 ? (
            <p className="text-xs text-muted-foreground">No milestones set</p>
          ) : (
            <div className="space-y-1.5">
              {milestones.map((m) => (
                <div key={m.label} className="flex items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="font-medium">{m.label}</span>
                    <span className="text-muted-foreground"> · {m.due.toLocaleDateString()}</span>
                  </div>
                  <Badge className={`${m.status.className} border-transparent text-[10px] px-1.5 py-0 shrink-0`}>
                    {m.status.label}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
        {!selectionMode && (
          <div className="pt-2">
            <Button variant="outline" size="sm" className="w-full">
              <FileText className="h-4 w-4 mr-2" />
              View Details
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
