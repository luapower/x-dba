
require'xmodule'
require'xrowset_mysql'

function dba_connections_grid()
	local layer = xmodule_layer'ck'
	return layer.dba_connections_grid
end

function dba_field_types_grid()
	local layer = xmodule_layer'ck'
	return layer.dba_field_types_grid
end

local function mkbool(t, ks)
	for k in ks:gmatch'[^%s]+' do
		t[k] = t[k] == 1
	end
end

local function mklower(t, ks)
	for k in ks:gmatch'[^%s]+' do
		t[k] = t[k]:lower()
	end
end

local conn_names = {}

do
	local cg = dba_connections_grid()
	local conns = cg and cg.row_vals
	if conns then
		for _,conn in ipairs(conns) do
			local name = conn.name:lower()
			for k in pairs{host=1, port=1, user=1, pass=1} do
				if conn[k] then
					config(name..'_db_'..k, conn[k])
				end
			end
			config(name..'_db_name', nil)
			conn_names[name] = true
		end
	end
end

local system_schemas = {
	information_schema=1,
	performance_schema=1,
	mysql=1,
}

action['dba_schemas.json'] = function()
	local t = {}
	for ns in pairs(conn_names) do
		local dbs = query_on(ns, 'show databases')
		for _,db in ipairs(dbs) do
			local system = system_schemas[db] and true or false
			local size = query1_on(ns, [[
				select
					sum(data_length + index_length)
				from
					information_schema.tables
				where
					table_schema = ?
			]], db)
			add(t, {
				connection = ns,
				qname = ns..'.'..db,
				name = db,
				size = size,
				system = system,
			})
		end
	end
	return t
end

action['dba_schema_tables.json'] = function()
	local t = {}
	for ns in pairs(conn_names) do
		for _,row in ipairs(kv_query_on(ns, [[
			select
				table_schema as `schema`,
				table_name as `name`,
				auto_increment,
				data_length + index_length as `size`,
				table_rows as `row_count`
			from
				information_schema.tables
		]])) do
			mklower(row, 'schema name')
			row.schema = ns..'.'..row.schema
			add(t, row)
		end
	end
	return t
end

local function load_field_types()
	local ftg = dba_field_types_grid()
	local types = {} --{sql_type->attrs}
	for _,row in ipairs(ftg.row_vals) do
		add(attr(types, row.sql_type), row)
	end
	return types
end

local function infer_type(db_type, types)
	local matching_types = types[db_type.sql_type]
	if not matching_types then return end
	--find the type that matches on most type attributes.
	local max_n = -1
	local best_type
	for i,matching_type in ipairs(matching_types) do
		local n = 0
		for k,v in pairs(matching_type) do
			if db_type[k] == v then
				n = n + 1
			end
		end
		if n > max_n then
			best_type = matching_type
			max_n = n
		end
	end
	--remove attribute values that match the ones in the type.
	for k,v in pairs(best_type) do
		if db_type[k] == v then
			db_type[k] = nil
		end
	end
	db_type.type = best_type.name
end

action['dba_schema_fields.json'] = function()
	local t = {}
	local types = load_field_types()
	for ns in pairs(conn_names) do
		for _,row in ipairs(kv_query_on(ns, [[
			select
				lower(c.table_schema) as `schema`,
				lower(c.table_name) as `table`,
				lower(c.column_name) as `name`,
				c.ordinal_position as `index`,
				c.column_type as `sql_type`,
				c.character_set_name as `charset`,
				c.collation_name as `collation`,
				c.is_nullable = 'NO' as `not_null`,
				c.column_key = 'PRI' as `pk`,
				c.column_key = 'UNI' as `uk`,
				if(c.extra like '%auto_increment%', 1, 0) as `auto_increment`,
				if(c.column_default, 'NULL', null) as `default`
			from
				information_schema.columns c
		]])) do
			mkbool(row, 'not_null pk uk auto_increment')
			row.index = tonumber(row.index) --retardedly exposed as bigint
			row.schema = ns..'.'..row.schema
			infer_type(row, types)
			add(t, row)
		end
	end
	return t
end

function rowset.dba_table_data()
	local params = json(args'params')[1]
	local ns, schema = params.schema:match'^([^%.]+)%.(.*)$'
	local table = params.name
	if not ns or not table then return {} end
	return sql_rowset{
		db = ns,
		select_all = 'select * from '..schema..'.'..table,
	}:respond()
end

