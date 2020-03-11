const OrganizationFilterableFields = [
    'name',
    'address_locality',
    'postal_code',
];
const OrganizationSortableFields = [
    'name',
    'id',
    'address_locality',
    'postal_code',
];

/**
 * Method to clean the filters sent in query parameters
 *
 * @param {object} filters from query parameters
 * @param {object} filterableFields the fields allowed to be used as a filter
 * @returns {object} Ready-to-use filters for the sql query
 */
const filtersSanitizer = (
    filters,
    filterableFields = OrganizationFilterableFields
) => {
    if (!filters || typeof filters !== 'object') {
        return {};
    }

    return Object.keys(filters)
        .filter(key => filterableFields.includes(key))
        .filter(key => filters[key] !== undefined)
        .filter(key => {
            if (typeof filters[key] === 'string') {
                return filters[key].trim() !== '';
            }
            return true;
        })
        .reduce((obj, key) => {
            obj[key] = filters[key];
            return obj;
        }, {});
};

/**
 * Method to clean the sort sent in query parameters
 *
 * @param {object} sort - sort from query parameters
 * @param {object} sortableFields the fields allowed to be used as a sort
 * @returns {object} Ready-to-use filters for the sql query
 */
const sortSanitizer = (sort, sortableFields = OrganizationSortableFields) => {
    const sortTwoFirstParameters = [
        sort ? sort[0] || null : null,
        sort ? sort[1] || null : null,
    ];
    if (
        !sortTwoFirstParameters ||
        !sortableFields.includes(sortTwoFirstParameters[0])
    ) {
        return [sortableFields[0], 'ASC'];
    }

    if (!['ASC', 'DESC'].includes(sort[1])) {
        return [sortTwoFirstParameters[0], 'ASC'];
    }

    return sortTwoFirstParameters;
};

/**
 * Function to clean the pagination sent in query parameters
 *
 * @param {object} pagination - pagination object from query parameters
 * @returns {object} Ready-to-use filters for the sql query
 */
const paginationSanitizer = pagination => {
    const sortTwoFirstParameters = [
        pagination ? parseInt(pagination[0]) || null : null,
        pagination ? parseInt(pagination[1]) || null : null,
    ];

    if (
        !Number.isInteger(sortTwoFirstParameters[0]) ||
        !Number.isInteger(sortTwoFirstParameters[1])
    ) {
        return [10, 1];
    }

    return sortTwoFirstParameters;
};

/**
 * Knex query for filtrated organization list
 *
 * @param {object} client - The Database client
 * @param {object} filters - Organization Filter
 * @param {Array} sort - Sort parameters [columnName, direction]
 * @returns {Promise} - Knew query for filtrated organization list
 */
const getFilteredOrganizationsQuery = (client, filters, sort) => {
    const { name, address_locality, postal_code, ...restFilters } = filters;
    const query = client
        .select(
            'organization.*',
            client.raw(`(SELECT array_to_json(array_agg(jsonb_build_object(
                'telephone', contact_point.telephone, 'name', contact_point.name, 'contactType', contact_point.contact_type
            ) ORDER BY contact_point.contact_type)) FROM contact_point WHERE contact_point.organization_id = organization.id) as contactPoints`)
        )
        .from('organization')
        .where(restFilters);

    if (name) {
        query.andWhere('name', 'LIKE', `%${name}%`);
    }
    if (address_locality) {
        query.andWhere('address_locality', 'LIKE', `${address_locality}%`);
    }

    if (postal_code) {
        query.andWhere('postal_code', 'LIKE', `${postal_code}%`);
    }

    if (sort && sort.length) {
        query.orderBy(...sort);
    }

    return query;
};

/**
 * Transforms the Knex paging object into a string compatible with the "content-Range" header.
 * https://developer.mozilla.org/fr/docs/Web/HTTP/Headers/Content-Range
 *
 * @param {string} objectType - type of object returned in the paginated collection
 * @param {object} pagination - Knex pagination object (https://github.com/felixmosh/knex-paginate#pagination-object)
 * @returns {string} string ready to be set has "Content-Range" http header
 * @example Content-Range: posts 0-24/319
 */
const formatPaginationContentRange = (objectType, pagination) =>
    `${objectType.toLowerCase()} ${pagination.from}-${pagination.to}/${
        pagination.total
    }`;

/**
 * Return paginated and filtered list of organization
 *
 * @param {object} client - The Database client
 * @param {object} filters - Organization Filter
 * @param {Array} sort - Sort parameters [columnName, direction]
 * @param {Array} pagination - Pagination [perPage, currentPage]
 * @returns {Promise} - paginated object with paginated organization list and totalCount
 */
const getOrganizationPaginatedList = async ({
    client,
    filters,
    sort,
    pagination,
}) => {
    const query = getFilteredOrganizationsQuery(
        client,
        filtersSanitizer(filters),
        sortSanitizer(sort)
    );
    const [perPage, currentPage] = paginationSanitizer(pagination);

    return query
        .paginate({ perPage, currentPage, isLengthAware: true })
        .then(result => ({
            organizations: result.data,
            contentRange: formatPaginationContentRange(
                'organizations',
                result.pagination
            ),
        }));
};

module.exports = {
    filtersSanitizer,
    formatPaginationContentRange,
    getOrganizationPaginatedList,
    paginationSanitizer,
    sortSanitizer,
};
