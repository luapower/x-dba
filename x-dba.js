(function() {

	function update_changes() {
		let rows = []
		let tg = dba_tables_grid
		for (let row of dba_tables_grid.all_rows) {
			let schema = tg.cell_val(row, 'schema')
			let table  = tg.cell_val(row, 'name')
			if (!(row.is_new && row.removed)) {
				if (row.is_new)
					rows.push({schema: schema, op: 'create_table', table: table})
				else if (row.removed)
					rows.push({schema: schema, op: 'drop_table', table: table})
				else if (row.modified)
					rows.push({schema: schema, op: 'rename_table', table: table,
							old_name: tg.cell_old_val(row, 'name')})
			}
		}
		let cg = dba_fields_grid
		for (let row of dba_fields_grid.all_rows) {
			if (!(row.is_new && row.removed) && (row.removed || row.modified)) {
				let ft = {}
				ft.schema = cg.cell_val(row, 'schema')
				ft.table  = cg.cell_val(row, 'table')
				ft.field  = cg.cell_val(row, 'name')
				if (row.is_new) {
					let t = update({}, ft)
					t.op = 'create_field'
					t.type     = cg.cell_val(row, 'type'    )
					t.not_null = cg.cell_val(row, 'not_null')
					t.fk_table = cg.cell_val(row, 'fk_table')
					t.fk_field = cg.cell_val(row, 'fk_field')
					rows.push(t)
				} else if (row.removed) {
					let t = update({}, ft)
					t.op = 'drop_field'
					rows.push(t)
				} else if (row.modified) {
					if (cg.cell_modified(row, 'name')) {
						let t = update({}, ft)
						t.op = 'rename_field'
						t.old_name = tg.cell_old_val(row, 'name')
						rows.push(t)
					}
					if (cg.cell_modified(row, 'type')) {
						let t = update({}, ft)
						t.op = 'change_field_type'
						t.type = cg.cell_val(row, 'type')
						rows.push(t)
					}
					if (cg.cell_modified(row, 'not_null')) {
						let t = update({}, ft)
						t.op = 'change_not_null'
						t.not_null = cg.cell_val(row, 'not_null')
						rows.push(t)
					}
					if (cg.cell_modified(row, 'fk_table') || cg.cell_modified(row, 'fk_field')) {
						let t = update({}, ft)
						t.op = 'change_fk'
						t.fk_table = cg.cell_val(row, 'fk_table')
						t.fk_field = cg.cell_val(row, 'fk_field')
						rows.push(t)
					}
				}
			}
		}
		dba_schema_changes_grid.row_vals = rows
	}

	document.on('dba_tables_grid.bind', function(e, on) {
		e.on('row_changed', update_changes, on)
	})

	document.on('dba_fields_grid.bind', function(e, on) {
		e.on('row_changed', update_changes, on)
	})


})()
