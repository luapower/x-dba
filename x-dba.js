(function() {

	let update_changes_barrier

	function inherit_schema(schema, parent_schema) {

		let tg = dba_tables_grid
		let fg = dba_fields_grid
		let table_of_parent_schema = tg.and_filter('schema', [parent_schema])
		let new_tables = []
		let new_fields = []
		for (let row of tg.all_rows) {
			if (table_of_parent_schema(row)) {
				let table = tg.cell_val(row, 'name')
				let child_row = tg.lookup('schema name', [schema, table])[0]
				if (!child_row) {
					new_tables.push({schema: schema, name: table})
					let field_rows = fg.lookup('schema table', [parent_schema, table])
					for (let field_row of field_rows) {
						let row_copy = fg.serialize_row_vals(field_row)
						row_copy.schema = schema
						new_fields.push(row_copy)
					}
				} else {
					//
				}
			}
		}

		update_changes_barrier = true

		tg.insert_rows(new_tables)
		fg.insert_rows(new_fields)

		update_changes_barrier = false
		update_changes()

		/*
		tg.rowset.rows = cg.deserialize_all_row_states(table_rows)
		tg.reset()
		fg.rowset.rows = cg.deserialize_all_row_states(field_rows)
		fg.reset()
		*/

	}

	function inherit_schemas() {
		let sg = window.dba_schemas_grid
		let tg = window.dba_tables_grid
		let fg = window.dba_fields_grid
		let cg = window.dba_schema_changes_grid
		if (!(sg && sg.bound && tg && tg.bound && fg && fg.bound && cg && cg.bound))
			return
		tg.begin_update()
		fg.begin_update()
		for (let row of sg.all_rows) {
			let cs = sg.cell_val(row, 'name')
			let ps = sg.cell_val(row, 'parent_schema')
			if (ps)
				inherit_schema(cs, ps)
		}
		tg.end_update()
		fg.end_update()
	}

	function update_changes() {
		if (update_changes_barrier)
			return
		let sg = dba_schemas_grid
		let tg = dba_tables_grid
		let fg = dba_fields_grid
		let cg = dba_schema_changes_grid
		let rows = []
		for (let row of sg.all_rows)
			if (row.is_new) {
				let conn   = sg.cell_val(row, 'connection')
				let schema = sg.cell_val(row, 'name')
				rows.push({connection: conn, schema: schema, op: 'create_database'})
			}
		for (let row of tg.all_rows) {
			let schema = tg.cell_val(row, 'schema')
			let table  = tg.cell_val(row, 'name')
			if (!(row.is_new && row.removed)) {
				if (row.is_new) {
					rows.push({schema: schema, op: 'create_table', table: table})
					let field_rows = fg.lookup('schema table', [schema, table])
					for (let field_row of field_rows) {
						let row = fg.serialize_row_vals(field_row)
						row.op = 'add_field'
						rows.push(row)
					}
				} else if (row.removed)
					rows.push({schema: schema, op: 'drop_table', table: table})
				else if (row.modified)
					rows.push({schema: schema, op: 'rename_table', table: table,
							old_name: tg.cell_old_val(row, 'name')})
			}
		}
		for (let row of dba_fields_grid.all_rows) {
			if (!row.is_new && (row.modified || row.removed)) {
				let ft = {}
				ft.schema = fg.cell_val(row, 'schema')
				ft.table  = fg.cell_val(row, 'table')
				ft.field  = fg.cell_val(row, 'name')
				if (row.removed) {
					let t = assign_opt({}, ft)
					t.op = 'drop_field'
					rows.push(t)
				} else if (row.modified) {
					if (fg.cell_modified(row, 'name')) {
						let t = assign_opt({}, ft)
						t.op = 'rename_field'
						t.old_name = tg.cell_old_val(row, 'name')
						rows.push(t)
					}
					if (fg.cell_modified(row, 'type')) {
						let t = assign_opt({}, ft)
						t.op = 'change_type'
						t.type = fg.cell_val(row, 'type')
						rows.push(t)
					}
					if (fg.cell_modified(row, 'not_null')) {
						let t = assign_opt({}, ft)
						t.op = 'change_not_null'
						t.not_null = fg.cell_val(row, 'not_null')
						rows.push(t)
					}
					if (fg.cell_modified(row, 'fk_table') || fg.cell_modified(row, 'fk_field')) {
						let t = assign_opt({}, ft)
						t.op = 'change_fk'
						t.fk_table = fg.cell_val(row, 'fk_table')
						t.fk_field = fg.cell_val(row, 'fk_field')
						rows.push(t)
					}
				}
			}
		}
		cg.rowset.rows = cg.deserialize_all_row_vals(rows)
		cg.reset()
	}

	function save_schema_row(row) {
		let sg = dba_schemas_grid
		if (!row.is_new) return
		let conn   = e.cell_val(row, 'connection')
		let schema = e.cell_val(row, 'name')
		if (!conn) return
		//let req = ajax({url: url(['dba_create_database', conn, schema]), async: false})
		//if (!req.fail)
	}

	function schemas_loaded(schemas) {
		let sg = window.dba_schemas_grid
		if (!sg)
			return
		for (let row of sg.all_rows)
			row.db_created = false
		sg.insert_rows(schemas, {row_state: {is_new: false, db_created: true}})
		sg.begin_update()
		for (let row of sg.all_rows) {
			if (sg.cell_val(row, 'system')) {
				row.nosave = true
				row.editable = false
			}
			if (!row.db_created && sg.cell_val(row, 'connection'))
				sg.set_row_is_new(row, true)
		}
		sg.end_update()
	}

	function schemas_cell_val_changed(row) {
		let sg = dba_schemas_grid
		let conn   = sg.cell_val(row, 'connection')
		let schema = sg.cell_val(row, 'name')
		let qname  = schema ? (conn ? conn+'.' : '') + schema : null
		sg.set_cell_val(row, 'qname', qname)
		update_changes()
	}

	function schemas_rows_changed(rows) {
		for (let row of rows)
			schemas_cell_val_changed(row)
	}

	document.on('dba_schemas_grid.bind', function(sg, on) {
		sg.on('rows_changed', schemas_rows_changed, on)
		sg.on('cell_val_changed', schemas_cell_val_changed, on)
		sg.save_row = save_schema_row
		sg.col_attrs = {name: {}}
		sg.col_attrs.name.format = function(v, row) {
			return row && sg.cell_val(row, 'system') ? div({style: 'color: #ccc'}, v) : v
		}
		if (on) {
			inherit_schemas()
			ajax({
				url: 'dba_schemas.json',
				success: schemas_loaded,
			})
		}
	})

	function tables_loaded(tables) {
		let tg = window.dba_tables_grid
		if (!tg)
			return
		tg.insert_rows(tables, {row_state: {is_new: false}})
	}

	document.on('dba_tables_grid.bind', function(e, on) {
		e.on('rows_changed', update_changes, on)
		if (on) {
			inherit_schemas()
			ajax({
				url: 'dba_schema_tables.json',
				success: tables_loaded,
			})
		}
	})

	function fields_loaded(fields) {
		let fg = window.dba_fields_grid
		if (!fg)
			return
		dba_fields_grid.insert_rows(fields, {row_state: {is_new: false}})
	}

	document.on('dba_fields_grid.bind', function(e, on) {
		e.on('rows_changed', update_changes, on)
		if (on) {
			inherit_schemas()
			ajax({
				url: 'dba_schema_fields.json',
				success: fields_loaded,
			})
		}
	})

	document.on('dba_schema_changes_grid.bind', function(e, on) {
		if (on)
			inherit_schemas()
	})

	document.on('dba_init_data_grid.bind', function(e, on) {
		if (on)
			inherit_schemas()
	})

	function table_fields(schema, table) {
		let fields = []
		let fg = dba_fields_grid
		let rows_of_table = fg.lookup('schema table', [schema, table])
		for (let row of rows_of_table) {
			let f = {}
			f.name = fg.cell_val(row, 'name')
			f.type = fg.cell_val(row, 'type')
			fields.push(f)
		}
		return fields
	}

	document.on('dba_init_data_grid_switcher.bind', function(e, on) {
		if (on) {
			e.item_create_options = function(vals) {
				let fields = table_fields(vals.schema, vals.name)
				return {
					type: 'grid',
					static_rowset: {
						fields: fields,
					},
					row_vals: [],
				}
			}
		}
	})

})()
