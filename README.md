# DataGrid React Router Integration

A React Router integration plugin for [@sovgut/datagrid](https://github.com/Sovgut/datagrid) that provides URL-based state management for your data grids.

## Features

- 🔄 Synchronizes DataGrid state with URL parameters
- 🔗 Shareable URLs with grid state (filtering, sorting, pagination)
- 📍 Browser history integration
- 🎯 Deep linking support
- 🔍 URL-based persistence of grid settings

## Installation

```bash
npm install @sovgut/datagrid @sovgut/datagrid-react-router
```

## Usage

```tsx
import { DataGrid, type DataGridColumn } from '@sovgut/datagrid';
import { useSharedDataGrid } from '@sovgut/datagrid-react-router';
import { useSearchParams } from 'react-router'

const columns: DataGridColumn[] = [...]

function UsersTable() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [dataGrid, dispatch] = useSharedDataGrid(
    [searchParams, setSearchParams],
    columns
  );

  return (
    <DataGrid
      columns={columns}
      context={[dataGrid, dispatch]}
      // ... other props
    >
      <MyTable />
    </DataGrid>
  );
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE.md for details.

## Related

- [@sovgut/datagrid](https://github.com/Sovgut/datagrid) - The core DataGrid package
