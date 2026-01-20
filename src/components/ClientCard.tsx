import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, FileText, Phone, Mail, MapPin } from 'lucide-react';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  case_number?: string;
  status: string;
  intake_date: string;
}

interface ClientCardProps {
  client: Client;
  onSelect: (client: Client) => void;
}

export const ClientCard: React.FC<ClientCardProps> = ({ client, onSelect }) => {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onSelect(client)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            {client.first_name} {client.last_name}
          </CardTitle>
          <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
            {client.status}
          </Badge>
        </div>
        {client.case_number && (
          <p className="text-sm text-muted-foreground">Member ID: {client.case_number}</p>
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
        <div className="pt-2">
          <Button variant="outline" size="sm" className="w-full">
            <FileText className="h-4 w-4 mr-2" />
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};