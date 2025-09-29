import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, GripVertical } from "lucide-react";

interface TableData {
  headers: string[];
  rows: string[][];
}

interface DynamicTableProps {
  data: TableData;
  onChange: (data: TableData) => void;
  onDelete: () => void;
}

export const DynamicTable = ({ data, onChange, onDelete }: DynamicTableProps) => {
  const updateHeader = (index: number, value: string) => {
    const newHeaders = [...data.headers];
    newHeaders[index] = value;
    onChange({ ...data, headers: newHeaders });
  };

  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    const newRows = [...data.rows];
    newRows[rowIndex][colIndex] = value;
    onChange({ ...data, rows: newRows });
  };

  const addRow = () => {
    const newRow = new Array(data.headers.length).fill("");
    onChange({ ...data, rows: [...data.rows, newRow] });
  };

  const addColumn = () => {
    const newHeaders = [...data.headers, "New Column"];
    const newRows = data.rows.map(row => [...row, ""]);
    onChange({ headers: newHeaders, rows: newRows });
  };

  const deleteRow = (index: number) => {
    const newRows = data.rows.filter((_, i) => i !== index);
    onChange({ ...data, rows: newRows });
  };

  const deleteColumn = (index: number) => {
    const newHeaders = data.headers.filter((_, i) => i !== index);
    const newRows = data.rows.map(row => row.filter((_, i) => i !== index));
    onChange({ headers: newHeaders, rows: newRows });
  };

  return (
    <div className="space-y-4">
      {/* Table Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={addRow}
            className="gap-2"
          >
            <Plus className="w-3 h-3" />
            Add Row
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={addColumn}
            className="gap-2"
          >
            <Plus className="w-3 h-3" />
            Add Column
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onDelete}
          className="gap-2 text-destructive hover:text-destructive"
        >
          <Trash2 className="w-3 h-3" />
          Delete Table
        </Button>
      </div>

      {/* Table */}
      <div className="border border-table-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            {/* Headers */}
            <thead>
              <tr className="bg-table-header">
                <th className="w-8 p-2"></th>
                {data.headers.map((header, index) => (
                  <th key={index} className="p-2 text-left min-w-[150px]">
                    <div className="flex items-center gap-2">
                      <Input
                        value={header}
                        onChange={(e) => updateHeader(index, e.target.value)}
                        className="font-semibold border-none bg-transparent p-0 h-auto"
                        placeholder="Column name"
                      />
                      {data.headers.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteColumn(index)}
                          className="p-1 h-auto text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            
            {/* Rows */}
            <tbody>
              {data.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-table-border hover:bg-muted/50">
                  <td className="p-2 w-8">
                    <div className="flex items-center gap-1">
                      <GripVertical className="w-3 h-3 text-muted-foreground" />
                      {data.rows.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteRow(rowIndex)}
                          className="p-1 h-auto text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                  {row.map((cell, colIndex) => (
                    <td key={colIndex} className="p-2">
                      <Input
                        value={cell}
                        onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                        className="border-none bg-transparent p-0 h-auto"
                        placeholder="Enter data..."
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};