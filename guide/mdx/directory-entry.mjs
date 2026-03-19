/**
 * Directory entry for the DataStore migration guide.
 *
 * Add this entry to src/directory/directory.mjs in the Amplify docs repo,
 * inside the `data` section's children array. Insert it after the
 * `aws-appsync-apollo-extensions` entry (around line 356).
 *
 * Usage:
 *   1. Open /home/ec2-user/Work/AmplifyDev/docs/src/directory/directory.mjs
 *   2. Find the `data` section (search for "build-a-backend/data")
 *   3. Add this entry as the last child in the data children array
 */
export const migrateFromDataStoreEntry = {
  path: 'src/pages/[platform]/build-a-backend/data/migrate-from-datastore/index.mdx',
  children: [
    {
      path: 'src/pages/[platform]/build-a-backend/data/migrate-from-datastore/choose-strategy/index.mdx'
    },
    {
      path: 'src/pages/[platform]/build-a-backend/data/migrate-from-datastore/set-up-apollo/index.mdx'
    },
    {
      path: 'src/pages/[platform]/build-a-backend/data/migrate-from-datastore/migrate-crud-operations/index.mdx'
    },
    {
      path: 'src/pages/[platform]/build-a-backend/data/migrate-from-datastore/migrate-relationships/index.mdx'
    },
    {
      path: 'src/pages/[platform]/build-a-backend/data/migrate-from-datastore/add-local-caching/index.mdx'
    },
    {
      path: 'src/pages/[platform]/build-a-backend/data/migrate-from-datastore/build-offline-support/index.mdx'
    },
    {
      path: 'src/pages/[platform]/build-a-backend/data/migrate-from-datastore/advanced-patterns/index.mdx'
    }
  ]
};
