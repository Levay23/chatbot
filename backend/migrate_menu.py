import sqlite3
import os

OLD_DB = "C:/Users/Tio/Desktop/AutoChat/restaurant-crm/backend/src/db/database.sqlite"
NEW_DB = "C:/Users/Tio/Desktop/ChatIA/restaurant-ai/backend/database/restaurant.db"

def migrate():
    try:
        old_conn = sqlite3.connect(OLD_DB)
        new_conn = sqlite3.connect(NEW_DB)
        
        old_cursor = old_conn.cursor()
        new_cursor = new_conn.cursor()
        
        # Clear existing products to ensure a clean start
        print("Cleaning products table...")
        new_cursor.execute("DELETE FROM products")
        
        # Get products from old DB
        # Schema: id, nombre, precio, categoria, activo
        old_cursor.execute("SELECT nombre, precio, categoria, activo FROM productos")
        old_products = old_cursor.fetchall()
        
        if not old_products:
            print("No products found in old database.")
            return

        print(f"Migrating {len(old_products)} products...")
        
        for p in old_products:
            name, price, category, active = p
            # Use lowercase for columns as expected by the new schema
            new_cursor.execute(
                "INSERT INTO products (name, price, category, active) VALUES (?, ?, ?, ?)",
                (name, price, category, active)
            )
        
        new_conn.commit()
        print("Migration completed successfully.")
        
        # Verify the result
        new_cursor.execute("SELECT COUNT(*) FROM products")
        count = new_cursor.fetchone()[0]
        print(f"Total products in new DB: {count}")
        
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        old_conn.close()
        new_conn.close()

if __name__ == "__main__":
    migrate()
