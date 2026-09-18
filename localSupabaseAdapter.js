(function () {
  class LocalQueryBuilder {
    constructor(apiUrl, table) {
      this.apiUrl = apiUrl.replace(/\/$/, '');
      this.query = {
        table,
        action: 'select',
        select: '*',
        filters: [],
        orders: [],
        limit: null,
        range: null,
        payload: null,
        returning: false,
        singleMode: null
      };
    }

    select(columns = '*') {
      this.query.select = columns || '*';
      this.query.returning = this.query.action !== 'select';
      return this;
    }

    insert(payload) {
      this.query.action = 'insert';
      this.query.payload = payload;
      return this;
    }

    update(payload) {
      this.query.action = 'update';
      this.query.payload = payload;
      return this;
    }

    delete() {
      this.query.action = 'delete';
      return this;
    }

    eq(column, value) {
      this.query.filters.push({ op: 'eq', column, value });
      return this;
    }

    neq(column, value) {
      this.query.filters.push({ op: 'neq', column, value });
      return this;
    }

    in(column, value) {
      this.query.filters.push({ op: 'in', column, value });
      return this;
    }

    is(column, value) {
      this.query.filters.push({ op: 'is', column, value });
      return this;
    }

    ilike(column, value) {
      this.query.filters.push({ op: 'ilike', column, value });
      return this;
    }

    like(column, value) {
      this.query.filters.push({ op: 'like', column, value });
      return this;
    }

    order(column, options = {}) {
      this.query.orders.push({
        column,
        ascending: options.ascending !== false
      });
      return this;
    }

    limit(value) {
      this.query.limit = Number(value);
      return this;
    }

    range(from, to) {
      this.query.range = {
        from: Number(from),
        to: Number(to)
      };
      return this;
    }

    single() {
      this.query.singleMode = 'single';
      return this.execute();
    }

    maybeSingle() {
      this.query.singleMode = 'maybeSingle';
      return this.execute();
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }

    async execute() {
      try {
        const response = await fetch(`${this.apiUrl}/api/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.query)
        });

        const result = await response.json();
        return {
          data: result.data ?? null,
          error: result.error || null
        };
      } catch (error) {
        return {
          data: null,
          error: {
            message: `No se pudo conectar con el API local: ${error.message}`
          }
        };
      }
    }
  }

  window.crearClienteLocalDeAnda = function crearClienteLocalDeAnda(apiUrl) {
    return {
      from(table) {
        return new LocalQueryBuilder(apiUrl, table);
      }
    };
  };
}());
