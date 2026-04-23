import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, FileText, Phone, Mail, MapPin } from 'lucide-react';

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
}

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
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
              {client.status}
            </Badge>
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
              No case manager assigned
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
